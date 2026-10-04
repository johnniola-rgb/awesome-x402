"""Runs every worker on each new minute and keeps the state the dashboard renders."""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from dataclasses import asdict
from datetime import date, datetime, time
from pathlib import Path

from .config import Config
from .indicators import Bar
from .options import ET
from .strategy import LABELS, Worker

log = logging.getLogger(__name__)

DAY_END = time(15, 59)


class History:
    """Daily results per worker, persisted to JSON so the calendar survives restarts."""

    def __init__(self, path: Path | None):
        self.path = path
        self.days: dict[str, dict] = {}
        if path and path.exists():
            try:
                self.days = json.loads(path.read_text())
            except json.JSONDecodeError:
                log.warning("ignoring unreadable history file %s", path)

    def record(self, d: date, workers: list[Worker]):
        trades = [t for w in workers for t in w.trades]
        self.days[d.isoformat()] = {
            "total": round(sum(w.realized for w in workers), 2),
            "workers": {w.id: round(w.realized, 2) for w in workers},
            "trades": len(trades),
            "wins": sum(1 for t in trades if t.pnl > 0),
        }
        if self.path:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.days, indent=1, sort_keys=True))

    def recent(self, n: int = 25) -> list[dict]:
        return [{"date": k, **v} for k, v in sorted(self.days.items())[-n:]]


class Engine:
    def __init__(self, cfg: Config, broker, feed, history_path: Path | None = None, mode: str = "sim"):
        self.cfg = cfg
        self.broker = broker
        self.feed = feed
        self.mode = mode
        self.workers = [Worker(w, cfg.risk, broker) for w in cfg.workers]
        self.history = History(history_path)
        self.lock = threading.Lock()
        self.day: date | None = None
        self.clock: datetime | None = None
        self.bars: dict[str, list[Bar]] = {s: [] for s in cfg.symbols}
        self.prev_close: dict[str, float] = {}
        self.series: dict[str, list[dict]] = {w.id: [] for w in self.workers}
        self.tape: list[dict] = []
        self.recap: dict | None = None
        self.day_closed = False
        self.status = "starting"
        self.error: str | None = None
        self.subscribers: set[asyncio.Queue] = set()

    # ------------------------------------------------------------------ loop
    async def run(self):
        try:
            self.status = "loading history"
            hist = await asyncio.to_thread(self.feed.history)
            today = datetime.now(ET).date()
            with self.lock:
                for w in self.workers:
                    for b in hist.get(w.symbol, []):
                        w.catch_up(b, today)
                        if b.ts.date() == today:
                            self._record_series(w, b)
                for s, bars in hist.items():
                    prior = [b for b in bars if b.ts.date() < today]
                    if prior:
                        self.prev_close[s] = prior[-1].close
                    self.bars[s] = [b for b in bars if b.ts.date() == today]
                    if self.bars[s]:
                        self.day = today
            self.status = "running"
            await self.broadcast([])
            async for ts, bars in self.feed.stream():
                events = await asyncio.to_thread(self.step, ts, bars)
                await self.broadcast(events)
            if not self.day_closed and self.day:
                with self.lock:
                    self._close_day()
                await self.broadcast([])
            self.status = "feed finished"
            await self.broadcast([])
        except asyncio.CancelledError:
            raise
        except Exception as e:  # noqa: BLE001 - surface to the dashboard instead of dying silently
            log.exception("engine stopped")
            self.status = "error"
            self.error = f"{type(e).__name__}: {e}"
            await self.broadcast([])

    def step(self, ts: datetime, bars: dict[str, Bar]) -> list[dict]:
        with self.lock:
            if self.day != ts.date():
                if self.day and not self.day_closed:
                    self._close_day()
                self._open_day(ts.date())
            self.clock = ts
            for s, b in bars.items():
                if s in self.bars:
                    self.bars[s].append(b)
            events = []
            for w in self.workers:
                b = bars.get(w.symbol)
                if b is None:
                    continue
                for ev in w.on_bar(b):
                    ev["ts"] = ts.strftime("%H:%M")
                    ev["name"] = w.cfg.name
                    events.append(ev)
                self._record_series(w, b)
            for ev in events:
                if ev["type"] in ("fire", "exit"):
                    self.tape.append(ev)
            del self.tape[:-40]
            if ts.time() >= DAY_END and not self.day_closed:
                self._close_day()
                events.append({"type": "day_end"})
            return events

    def _open_day(self, d: date):
        for s, bars in self.bars.items():
            if bars:
                self.prev_close[s] = bars[-1].close
            self.bars[s] = []
        self.series = {w.id: [] for w in self.workers}
        self.tape = []
        self.recap = None
        self.day_closed = False
        self.day = d

    def _close_day(self):
        for w in self.workers:
            w.force_flat("flat by close")
        self.history.record(self.day, self.workers)
        self.recap = self._recap()
        self.day_closed = True

    def _record_series(self, w: Worker, b: Bar):
        self.series[w.id].append({
            "t": int(b.ts.timestamp()),
            "vwap": _r(w.vwap.value), "ema9": _r(w.ema9.value), "ema21": _r(w.ema21.value), "ema50": _r(w.ema50.value),
            "orbH": _r(w.orb.high) if w.orb.ready else None, "orbL": _r(w.orb.low) if w.orb.ready else None,
        })

    def shutdown(self):
        if self.mode != "paper":
            return
        with self.lock:
            for w in self.workers:
                try:
                    if w.force_flat("shutdown"):
                        log.info("closed %s position on shutdown", w.id)
                except Exception:  # noqa: BLE001
                    log.exception("could not flatten %s", w.id)

    # ------------------------------------------------------------------ views
    def _recap(self) -> dict:
        ws = sorted(self.workers, key=lambda w: w.realized, reverse=True)
        trades = [t for w in self.workers for t in w.trades]
        return {
            "date": self.day.isoformat(),
            "total": round(sum(w.realized for w in self.workers), 2),
            "trades": len(trades),
            "wins": sum(1 for t in trades if t.pnl > 0),
            "workers": [{"id": w.id, "name": w.cfg.name, "pnl": round(w.realized, 2)} for w in self.workers],
            "top": {"id": ws[0].id, "name": ws[0].cfg.name, "pnl": round(ws[0].realized, 2)} if ws else None,
        }

    def _worker_view(self, w: Worker) -> dict:
        price = w.last_bar.close if w.last_bar else None
        prev = self.prev_close.get(w.symbol)
        wins = sum(1 for t in w.trades if t.pnl > 0)
        c = w.charge
        p = w.position
        return {
            "id": w.id, "name": w.cfg.name, "symbol": w.symbol, "triggers": w.cfg.triggers,
            "state": w.state,
            "price": price, "change_pct": round((price / prev - 1) * 100, 2) if price and prev else None,
            "earned": round(w.earned, 2), "realized": round(w.realized, 2), "unrealized": round(w.unrealized, 2),
            "trades_n": len(w.trades), "wins": wins,
            "win_rate": round(wins / len(w.trades) * 100) if w.trades else None,
            "charge": None if c is None else {**asdict(c), "label": LABELS[c.trigger]},
            "position": None if p is None else {
                "side": p.side, "qty": p.qty, "entry": p.entry, "mark": round(p.mark, 2), "pnl": round(p.pnl, 2),
                "contract": p.contract, "strike": p.strike, "expiry": p.expiry.isoformat(), "trigger": LABELS[p.trigger],
                "trailing": p.trailing, "since": p.entry_ts.strftime("%H:%M"),
            },
            "thoughts": [asdict(t) for t in w.thoughts[-14:]][::-1],
            "trades": [asdict(t) for t in w.trades][::-1],
        }

    def snapshot(self, events: list[dict] | None = None) -> dict:
        with self.lock:
            workers = [self._worker_view(w) for w in self.workers]
            clock = self.clock
            to_close = None
            market = "closed"
            if clock and not self.day_closed:
                mins = (16 * 60) - (clock.hour * 60 + clock.minute) - 1
                market = "open" if mins >= 0 else "closed"
                to_close = max(mins, 0)
            return {
                "mode": self.mode, "broker": self.broker.name, "feed": self.feed.name,
                "status": self.status, "error": self.error,
                "date": self.day.isoformat() if self.day else None,
                "clock": clock.strftime("%H:%M") if clock else None,
                "market": market, "to_close_min": to_close,
                "vault": {
                    "total": round(sum(w["earned"] for w in workers), 2),
                    "realized": round(sum(w["realized"] for w in workers), 2),
                    "on_shift": sum(1 for w in workers if w["state"] not in ("clocked_out", "benched", "closed")),
                    "trades": sum(w["trades_n"] for w in workers),
                },
                "workers": workers,
                "leaderboard": [w["id"] for w in sorted(workers, key=lambda w: w["earned"], reverse=True)],
                "history": self.history.recent(),
                "tape": self.tape[::-1][:30],
                "recap": self.recap,
                "events": events or [],
                "risk": self.cfg.to_dict()["risk"],
            }

    def chart(self, worker_id: str) -> dict | None:
        with self.lock:
            w = next((w for w in self.workers if w.id == worker_id), None)
            if w is None:
                return None
            bars = self.bars.get(w.symbol, [])
            return {
                "id": w.id, "symbol": w.symbol, "triggers": w.cfg.triggers,
                "bars": [{"t": int(b.ts.timestamp()), "o": b.open, "h": b.high, "l": b.low, "c": b.close} for b in bars],
                "series": list(self.series.get(w.id, [])),
                "trades": [asdict(t) for t in w.trades],
                "position": None if not w.position else {
                    "side": w.position.side, "t": int(w.position.entry_ts.timestamp()), "spot": w.position.spot_entry},
            }

    # ------------------------------------------------------------------ pub/sub
    async def broadcast(self, events: list[dict]):
        if not self.subscribers:
            return
        snap = self.snapshot(events)
        for q in list(self.subscribers):
            if q.full():
                try:
                    q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            q.put_nowait(snap)


def _r(x: float | None) -> float | None:
    return None if x is None else round(x, 3)
