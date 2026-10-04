from datetime import date, datetime, timedelta

from scalpcity.broker import Fill
from scalpcity.config import RiskConfig, WorkerConfig
from scalpcity.indicators import Bar
from scalpcity.options import ET
from scalpcity.strategy import Worker


class FakeBroker:
    """Premium moves $0.50 per $1 of underlying in the position's favour."""

    def __init__(self):
        self.orders = []
        self.entry_spot = {}

    def buy(self, underlying, side, spot, ts, budget, max_contracts):
        c = f"{underlying}-{side}-{len(self.orders)}"
        self.orders.append(("buy", c, spot))
        self.entry_spot[c] = (spot, side)
        return Fill(c, round(spot), date(2026, 10, 5), 10, 2.0)

    def mark(self, contract, spot, ts):
        s0, side = self.entry_spot[contract]
        move = spot - s0 if side == "call" else s0 - spot
        return max(0.01, 2.0 + 0.5 * move)

    def sell(self, contract, qty, spot, ts):
        self.orders.append(("sell", contract, spot))
        return round(self.mark(contract, spot, ts), 2)


def t(h, m, d=2):
    return datetime(2026, 10, d, h, m, tzinfo=ET)


def bar(ts, c, o=None, spread=0.2, v=1000):
    o = c if o is None else o
    return Bar(ts, o, max(o, c) + spread, min(o, c) - spread, c, v)


def make(triggers, **risk):
    r = RiskConfig(cooldown_minutes=5, **risk)
    w = Worker(WorkerConfig("w", "W", "QQQ", triggers), r, FakeBroker())
    # prior session: a gentle wave so the 9/21 EMAs are not squeezed
    ts = t(14, 0, d=1)
    for i in range(120):
        w.catch_up(bar(ts + timedelta(minutes=i), 100 + (i % 40) * 0.05), date(2026, 10, 2))
    return w


def feed(w, start, closes):
    events = []
    for i, c in enumerate(closes):
        events += w.on_bar(bar(start + timedelta(minutes=i), c))
    return events


def test_orb_breakout_buys_call_then_locks_profit():
    w = make(["orb"])
    feed(w, t(9, 30), [100.0] * 15)  # opening range ~99.8-100.2
    ev = feed(w, t(9, 45), [100.1, 100.6])
    fires = [e for e in ev if e["type"] == "fire"]
    assert fires and fires[0]["side"] == "call" and fires[0]["trigger"] == "orb_high"
    # run up (premium +25% triggers trailing), then give back 10%+ from the high
    ev = feed(w, t(9, 47), [101.2, 102.0, 102.4, 101.6])
    exits = [e for e in ev if e["type"] == "exit"]
    assert exits and exits[0]["reason"] == "profit locked" and exits[0]["pnl"] > 0


def test_stop_loss_and_cooldown_blocks_reentry():
    w = make(["orb"], stop_loss_pct=0.18, daily_max_loss=1000)
    feed(w, t(9, 30), [100.0] * 15)
    ev = feed(w, t(9, 45), [99.5])  # break of ORB low -> put
    assert [e["side"] for e in ev if e["type"] == "fire"] == ["put"]
    ev = feed(w, t(9, 46), [100.3])  # premium 2.0 -> 1.6 (-20%)
    assert [e["reason"] for e in ev if e["type"] == "exit"] == ["stopped out"]
    assert w.state == "cooldown"
    assert not [e for e in feed(w, t(9, 47), [99.0, 100.5]) if e["type"] == "fire"]


def test_vwap_cross_skipped_when_emas_squeezed():
    w = make(["vwap"])
    # flat tape -> EMA9 == EMA21 -> chop
    feed(w, t(9, 30), [100.0] * 40)
    ev = feed(w, t(10, 10), [99.9, 100.4])
    assert any(e["type"] == "skip" for e in ev)
    assert not any(e["type"] == "fire" for e in ev)


def test_vwap_cross_fires_when_trending():
    w = make(["vwap"])
    closes = [100 - i * 0.08 for i in range(30)]  # trend down, below VWAP
    feed(w, t(9, 30), closes)
    vwap = w.vwap.value
    ev = feed(w, t(10, 0), [vwap + 0.6])  # sharp close back above VWAP
    fires = [e for e in ev if e["type"] == "fire"]
    assert fires and fires[0]["side"] == "call" and fires[0]["trigger"] == "vwap"


def test_daily_goal_clocks_out():
    w = make(["orb"], daily_goal=100)
    feed(w, t(9, 30), [100.0] * 15)
    feed(w, t(9, 45), [100.6, 101.5, 102.5, 101.6])
    assert w.realized >= 100 and w.state == "clocked_out"
    assert not [e for e in feed(w, t(10, 0), [99.0, 103.0]) if e["type"] == "fire"]


def test_catch_up_never_trades():
    w = make(["orb", "vwap", "ema50"])
    for i in range(60):
        w.catch_up(bar(t(9, 30) + timedelta(minutes=i), 100 + (i % 7)), date(2026, 10, 2))
    assert w.broker.orders == [] and w.orb.ready
