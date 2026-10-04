"""Option helpers: 1DTE expiry, strike selection, OCC symbols, Black-Scholes."""
from __future__ import annotations

import math
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")

# NYSE full-day holidays (used by the simulator; paper mode asks Alpaca's calendar).
HOLIDAYS = {
    date(2025, 1, 1), date(2025, 1, 20), date(2025, 2, 17), date(2025, 4, 18), date(2025, 5, 26),
    date(2025, 6, 19), date(2025, 7, 4), date(2025, 9, 1), date(2025, 11, 27), date(2025, 12, 25),
    date(2026, 1, 1), date(2026, 1, 19), date(2026, 2, 16), date(2026, 4, 3), date(2026, 5, 25),
    date(2026, 6, 19), date(2026, 7, 3), date(2026, 9, 7), date(2026, 11, 26), date(2026, 12, 25),
    date(2027, 1, 1), date(2027, 1, 18), date(2027, 2, 15), date(2027, 3, 26), date(2027, 5, 31),
    date(2027, 6, 18), date(2027, 7, 5), date(2027, 9, 6), date(2027, 11, 25), date(2027, 12, 24),
}


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in HOLIDAYS


def next_trading_day(d: date) -> date:
    d += timedelta(days=1)
    while not is_trading_day(d):
        d += timedelta(days=1)
    return d


def prev_trading_day(d: date) -> date:
    d -= timedelta(days=1)
    while not is_trading_day(d):
        d -= timedelta(days=1)
    return d


def pick_strike(price: float, side: str, increment: float = 1.0) -> float:
    """Strike at the money, or the next one out if price sits between strikes."""
    lower = math.floor(price / increment) * increment
    upper = lower + increment
    if abs(price - lower) < 1e-9:
        return lower
    return upper if side == "call" else lower


def occ_symbol(root: str, expiry: date, side: str, strike: float) -> str:
    return f"{root}{expiry:%y%m%d}{'C' if side == 'call' else 'P'}{int(round(strike * 1000)):08d}"


def years_to_expiry(ts: datetime, expiry: date) -> float:
    exp_dt = datetime.combine(expiry, time(16, 0), tzinfo=ET)
    secs = max((exp_dt - ts).total_seconds(), 60.0)
    return secs / (365.0 * 24 * 3600)


def _ncdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def bs_price(spot: float, strike: float, t: float, sigma: float, side: str, r: float = 0.04) -> float:
    if t <= 0 or sigma <= 0:
        intrinsic = spot - strike if side == "call" else strike - spot
        return max(intrinsic, 0.0)
    sq = sigma * math.sqrt(t)
    d1 = (math.log(spot / strike) + (r + 0.5 * sigma * sigma) * t) / sq
    d2 = d1 - sq
    if side == "call":
        return spot * _ncdf(d1) - strike * math.exp(-r * t) * _ncdf(d2)
    return strike * math.exp(-r * t) * _ncdf(-d2) - spot * _ncdf(-d1)
