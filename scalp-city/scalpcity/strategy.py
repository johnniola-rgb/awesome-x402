"""A worker: one bot trading 1DTE options on one underlying off 1-minute candles.

Entries — a candle *closes* across one of its triggers:
    vwap   session VWAP
    ema50  50-period EMA
    orb    high/low of the first 15 minutes (opening range breakout)
Closing above buys a call, closing below buys a put; strike at or next to the
current price, expiring the next trading day.

Filters — VWAP crosses are skipped while the 9 and 21 EMAs are squeezed (chop),
and the worker cools down for a few minutes after every trade.

Exits — premium stop ("stopped out"), trailing take-profit ("profit locked"),
the underlying closing back through the trigger ("reversal"), a max hold
time, and a flat-by-close rule. Once a worker reaches its daily goal it clocks
out; if it hits its daily max loss it is benched.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from typing import Protocol

from .broker import Fill
from .config import RiskConfig, WorkerConfig
from .indicators import ATR, EMA, Bar, OpeningRange, SessionVWAP, in_session

LABELS = {"vwap": "VWAP", "ema50": "EMA50", "orb_high": "ORB high", "orb_low": "ORB low"}
ARROW = {"call": "▲", "put": "▼"}


class Broker(Protocol):
    def buy(self, underlying: str, side: str, spot: float, ts: datetime, budget: float, max_contracts: int) -> Fill | None: ...
    def mark(self, contract: str, spot: float, ts: datetime) -> float: ...
    def sell(self, contract: str, qty: int, spot: float, ts: datetime) -> float: ...


@dataclass
class Position:
    side: str
    contract: str
    strike: float
    expiry: date
    qty: int
    entry: float
    entry_ts: datetime
    trigger: str
    level: float
    spot_entry: float
    mark: float
    high_water: float
    trailing: bool = False

    @property
    def pnl(self) -> float:
        return (self.mark - self.entry) * self.qty * 100


@dataclass
class Trade:
    worker: str
    symbol: str
    side: str
    contract: str
    qty: int
    entry: float
    exit: float
    entry_ts: str
    exit_ts: str
    trigger: str
    reason: str
    pnl: float


@dataclass
class Thought:
    ts: str
    kind: str  # forming | fire | locked | stopped | faded | skip | goal | benched | info
    text: str


@dataclass
class Charge:
    trigger: str
    side: str
    level: float
    atr_away: float
    pct: float
    blocked: str | None = None  # reason a cross here would be skipped


@dataclass
class Worker:
    cfg: WorkerConfig
    risk: RiskConfig
    broker: Broker

    ema9: EMA = field(default_factory=lambda: EMA(9))
    ema21: EMA = field(default_factory=lambda: EMA(21))
    ema50: EMA = field(default_factory=lambda: EMA(50))
    atr: ATR = field(default_factory=lambda: ATR(14))
    vwap: SessionVWAP = field(default_factory=SessionVWAP)
    orb: OpeningRange = field(init=False)

    session: date | None = None
    prev_close: float | None = None
    prev_levels: dict = field(default_factory=dict)
    position: Position | None = None
    trades: list[Trade] = field(default_factory=list)  # today's
    thoughts: list[Thought] = field(default_factory=list)  # today's
    realized: float = 0.0
    cooldown_until: datetime | None = None
    state: str = "warming"  # warming | watching | charging | in_trade | cooldown | clocked_out | benched | closed
    charge: Charge | None = None
    orb_used: set = field(default_factory=set)
    _forming: bool = False
    last_bar: Bar | None = None

    def __post_init__(self):
        self.orb = OpeningRange(self.risk.orb_minutes)

    # ------------------------------------------------------------------ helpers
    @property
    def id(self) -> str:
        return self.cfg.id

    @property
    def symbol(self) -> str:
        return self.cfg.symbol

    @property
    def unrealized(self) -> float:
        return self.position.pnl if self.position else 0.0

    @property
    def earned(self) -> float:
        return self.realized + self.unrealized

    def think(self, ts: datetime, kind: str, text: str):
        self.thoughts.append(Thought(ts.strftime("%H:%M"), kind, text))
        del self.thoughts[:-60]

    def _new_session(self, d: date):
        self.session = d
        self.vwap.reset()
        self.orb.reset()
        self.trades = []
        self.thoughts = []
        self.realized = 0.0
        self.cooldown_until = None
        self.orb_used = set()
        self.prev_levels = {}
        self._forming = False
        self.state = "watching"

    def levels(self) -> dict[str, float]:
        out = {}
        if "vwap" in self.cfg.triggers and self.vwap.value is not None:
            out["vwap"] = self.vwap.value
        if "ema50" in self.cfg.triggers and self.ema50.ready:
            out["ema50"] = self.ema50.value
        if "orb" in self.cfg.triggers and self.orb.ready:
            out["orb_high"] = self.orb.high
            out["orb_low"] = self.orb.low
        return out

    def squeezed(self) -> bool:
        if not (self.ema21.ready and self.atr.value):
            return True
        return abs(self.ema9.value - self.ema21.value) < self.risk.squeeze_atr * self.atr.value

    def _charges(self, close: float, levels: dict[str, float]) -> list[Charge]:
        atr = self.atr.value
        out = []
        for name, level in levels.items():
            if name == "orb_high":
                if close > level or "orb_high" in self.orb_used:
                    continue
                side = "call"
            elif name == "orb_low":
                if close < level or "orb_low" in self.orb_used:
                    continue
                side = "put"
            else:
                side = "put" if close > level else "call"
            away = abs(close - level) / atr
            pct = max(0.0, 1.0 - away / self.risk.charge_window_atr)
            blocked = "9/21 EMA squeeze (chop)" if name == "vwap" and self.squeezed() else None
            out.append(Charge(name, side, level, round(away, 2), round(pct, 3), blocked))
        out.sort(key=lambda c: (c.blocked is not None, -c.pct))
        return out

    # ------------------------------------------------------------------ main loop
    def warm(self, bar: Bar):
        """Feed prior-session bars so the EMAs/ATR are ready at the open."""
        self.ema9.update(bar.close)
        self.ema21.update(bar.close)
        self.ema50.update(bar.close)
        self.atr.update(bar.high, bar.low, bar.close)
        self.prev_close = bar.close

    def _update(self, bar: Bar):
        self.ema9.update(bar.close)
        self.ema21.update(bar.close)
        self.ema50.update(bar.close)
        self.atr.update(bar.high, bar.low, bar.close)
        self.vwap.update(bar.high, bar.low, bar.close, bar.volume)
        self.orb.update(bar)
        self.prev_close = bar.close
        self.last_bar = bar

    def catch_up(self, bar: Bar, today: date):
        """Replay bars from before start-up: indicators only, never trades."""
        if bar.ts.date() != today or not in_session(bar.ts):
            self.warm(bar)
            return
        if bar.ts.date() != self.session:
            self._new_session(bar.ts.date())
        self._update(bar)

    def on_bar(self, bar: Bar) -> list[dict]:
        events: list[dict] = []
        if not in_session(bar.ts):
            self.warm(bar)
            return events
        if bar.ts.date() != self.session:
            self._new_session(bar.ts.date())

        prev_close = self.prev_close
        prev_levels = self.levels()
        self._update(bar)
        levels = self.levels()
        t = bar.ts.time()

        if self.position:
            events += self._manage(bar, levels)

        if not self.atr.value or not self.ema21.ready:
            self.state = "warming"
            return events
        if self.state in ("clocked_out", "benched"):
            self.charge = None
            return events
        if t >= self.risk.entry_end and not self.position:
            self.state = "closed"
            self.charge = None
            return events

        charges = self._charges(bar.close, levels)
        self.charge = charges[0] if charges else None

        if self.position:
            self.state = "in_trade"
            return events
        if self.cooldown_until and bar.ts < self.cooldown_until:
            self.state = "cooldown"
            return events
        if t < self.risk.entry_start:
            self.state = "watching"
            return events

        # Did this candle close across a trigger?
        if prev_close is not None:
            for name, level in levels.items():
                before = prev_levels.get(name, level)
                side = None
                if prev_close <= before and bar.close > level:
                    side = "call"
                elif prev_close >= before and bar.close < level:
                    side = "put"
                if side is None:
                    continue
                if name == "orb_high" and side != "call" or name == "orb_low" and side != "put":
                    continue
                if name.startswith("orb") and name in self.orb_used:
                    continue
                if name == "vwap" and self.squeezed():
                    self.think(bar.ts, "skip", f"skip VWAP cross {ARROW[side]} — 9/21 EMAs squeezed, chop")
                    events.append({"type": "skip", "worker": self.id, "trigger": name})
                    continue
                ev = self._enter(bar, side, name, level)
                if ev:
                    events.append(ev)
                    break

        if self.position:
            self.state = "in_trade"
            self._forming = False
            return events

        c = self.charge
        if c and not c.blocked and c.pct >= 0.5 and not self._forming:
            self._forming = True
            self.think(bar.ts, "forming", f"setup forming: {ARROW[c.side]} {c.side.upper()} at {LABELS[c.trigger]}, {c.atr_away:.2f} ATR away")
        elif self._forming and (not c or c.blocked or c.pct < 0.2):
            self._forming = False
            self.think(bar.ts, "faded", "setup faded, standing down")
        self.state = "charging" if c and not c.blocked and c.pct > 0 else "watching"
        return events

    # ------------------------------------------------------------------ orders
    def _enter(self, bar: Bar, side: str, trigger: str, level: float) -> dict | None:
        fill = self.broker.buy(self.cfg.symbol, side, bar.close, bar.ts, self.risk.budget_per_trade, self.risk.max_contracts)
        if fill is None:
            self.think(bar.ts, "info", f"{ARROW[side]} {side.upper()} signal at {LABELS[trigger]} but no fill")
            return None
        if trigger.startswith("orb"):
            self.orb_used.add(trigger)
        self.position = Position(side, fill.contract, fill.strike, fill.expiry, fill.qty, fill.price, bar.ts,
                                 trigger, level, bar.close, fill.price, fill.price)
        self.think(bar.ts, "fire", f"FIRE {ARROW[side]} {side.upper()} ×{fill.qty} @ {fill.price:.2f} ({self.cfg.symbol} {bar.close:.2f})")
        return {"type": "fire", "worker": self.id, "side": side, "trigger": trigger, "qty": fill.qty,
                "price": fill.price, "contract": fill.contract, "spot": bar.close}

    def _manage(self, bar: Bar, levels: dict[str, float]) -> list[dict]:
        p = self.position
        r = self.risk
        p.mark = self.broker.mark(p.contract, bar.close, bar.ts)
        p.high_water = max(p.high_water, p.mark)
        gain = p.mark / p.entry - 1
        if gain >= r.take_profit_pct:
            p.trailing = True

        reason = None
        if bar.ts.time() >= r.flatten_at:
            reason = "flat by close"
        elif gain <= -r.stop_loss_pct:
            reason = "stopped out"
        elif p.trailing and p.mark <= p.high_water * (1 - r.trail_pct):
            reason = "profit locked"
        else:
            level = levels.get(p.trigger, p.level)
            back = (level - bar.close) if p.side == "call" else (bar.close - level)
            if back > r.fade_atr * (self.atr.value or 0):
                reason = "reversal"
            elif (bar.ts - p.entry_ts).total_seconds() >= r.max_hold_minutes * 60:
                reason = "time stop"
        if reason is None:
            return []
        return [self._exit(bar, reason)]

    def _exit(self, bar: Bar, reason: str) -> dict:
        p = self.position
        price = self.broker.sell(p.contract, p.qty, bar.close, bar.ts)
        pnl = round((price - p.entry) * p.qty * 100, 2)
        self.realized = round(self.realized + pnl, 2)
        trade = Trade(self.id, self.cfg.symbol, p.side, p.contract, p.qty, p.entry, price,
                      p.entry_ts.isoformat(), bar.ts.isoformat(), p.trigger, reason, pnl)
        self.trades.append(trade)
        self.position = None
        self.cooldown_until = bar.ts.replace(second=0) + timedelta(minutes=self.risk.cooldown_minutes)
        kind = "locked" if pnl >= 0 else "stopped"
        sign = "+" if pnl >= 0 else "−"
        self.think(bar.ts, kind, f"{reason} {sign}${abs(pnl):,.0f}")
        ev = {"type": "exit", "worker": self.id, "reason": reason, "pnl": pnl, "trade": asdict(trade)}
        if self.realized >= self.risk.daily_goal:
            self.state = "clocked_out"
            self.think(bar.ts, "goal", f"daily goal +${self.realized:,.0f} · clocking out")
            ev["clocked_out"] = True
        elif self.realized <= -self.risk.daily_max_loss:
            self.state = "benched"
            self.think(bar.ts, "benched", f"daily max loss −${-self.realized:,.0f} · benched for the day")
            ev["benched"] = True
        else:
            self.state = "cooldown"
        return ev

    def force_flat(self, reason: str = "shutdown") -> dict | None:
        if self.position and self.last_bar:
            return self._exit(self.last_bar, reason)
        return None
