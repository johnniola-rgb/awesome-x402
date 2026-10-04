from datetime import datetime

from scalpcity.indicators import ATR, EMA, Bar, OpeningRange, SessionVWAP
from scalpcity.options import ET, bs_price, next_trading_day, occ_symbol, pick_strike


def test_ema_converges_and_ready():
    e = EMA(9)
    for _ in range(9):
        e.update(10.0)
    assert e.ready and e.value == 10.0
    e.update(20.0)
    assert abs(e.value - 12.0) < 1e-9  # k = 0.2


def test_vwap_volume_weighted():
    v = SessionVWAP()
    v.update(10, 10, 10, 100)
    v.update(20, 20, 20, 300)
    assert abs(v.value - 17.5) < 1e-9
    v.reset()
    assert v.value is None


def test_atr_seeds_then_smooths():
    a = ATR(3)
    for h, l, c in [(11, 9, 10), (12, 10, 11), (13, 11, 12)]:
        a.update(h, l, c)
    assert a.value == 2.0
    a.update(20, 12, 19)  # true range 8
    assert abs(a.value - (2 * 2 + 8) / 3) < 1e-9


def test_opening_range_first_15_minutes():
    o = OpeningRange(15)
    for i, (h, l) in enumerate([(101, 99), (103, 100), (102, 98)]):
        o.update(Bar(datetime(2026, 10, 2, 9, 30 + i, tzinfo=ET), 100, h, l, 100, 1))
    assert (o.high, o.low, o.ready) == (103, 98, False)
    o.update(Bar(datetime(2026, 10, 2, 9, 45, tzinfo=ET), 100, 110, 90, 100, 1))
    assert (o.high, o.low, o.ready) == (103, 98, True)


def test_one_dte_expiry_skips_weekend_and_holiday():
    assert next_trading_day(datetime(2026, 10, 2).date()).isoformat() == "2026-10-05"  # Fri -> Mon
    assert next_trading_day(datetime(2026, 11, 25).date()).isoformat() == "2026-11-27"  # Thanksgiving


def test_strike_and_occ():
    assert pick_strike(752.4, "call") == 753
    assert pick_strike(752.4, "put") == 752
    assert pick_strike(752.0, "call") == 752
    assert occ_symbol("QQQ", datetime(2026, 10, 5).date(), "call", 753) == "QQQ261005C00753000"


def test_black_scholes_put_call_parity():
    import math
    s, k, t, vol, r = 750, 752, 1 / 252, 0.2, 0.04
    c, p = bs_price(s, k, t, vol, "call", r), bs_price(s, k, t, vol, "put", r)
    assert abs((c - p) - (s - k * math.exp(-r * t))) < 1e-6


def test_align_fills_gaps_flat():
    from datetime import timedelta

    from scalpcity.feeds import _align, session_minutes

    mins = session_minutes(datetime(2026, 10, 2).date())[:3]
    a = [Bar(mins[0], 1, 1, 1, 1, 5), Bar(mins[2], 2, 2, 2, 2, 5)]
    b = [Bar(m, 9, 9, 9, 9, 5) for m in mins]
    rows = _align({"A": a, "B": b}, mins)
    assert [r[1]["A"].close for r in rows] == [1, 1, 2]
    assert rows[1][1]["A"].volume == 0
    assert len(session_minutes(datetime(2026, 10, 2).date())) == 390
