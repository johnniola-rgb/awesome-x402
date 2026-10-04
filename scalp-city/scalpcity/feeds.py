"""1-minute bar feeds.

    SimFeed            synthetic, correlated QQQ/SPY/IWM sessions (no keys needed)
    AlpacaReplayFeed   real historical 1-minute bars from Alpaca, replayed at any speed
    AlpacaLiveFeed     polls Alpaca for each completed 1-minute bar during market hours

Every feed provides history() — bars before the stream starts, used to warm up
indicators — and stream(), an async iterator of (timestamp, {symbol: Bar}).
"""
from __future__ import annotations

import asyncio
import logging
import math
import random
from datetime import date, datetime, time, timedelta
from typing import AsyncIterator

from .indicators import Bar
from .options import ET, is_trading_day, next_trading_day, prev_trading_day

log = logging.getLogger(__name__)

SIM_START = {"QQQ": 752.0, "SPY": 688.0, "IWM": 246.0}
SIM_BETA = {"QQQ": 1.0, "SPY": 0.8, "IWM": 1.25}


def session_minutes(d: date, start: time = time(9, 30), end: time = time(16, 0)) -> list[datetime]:
    t = datetime.combine(d, start, tzinfo=ET)
    stop = datetime.combine(d, end, tzinfo=ET)
    out = []
    while t < stop:
        out.append(t)
        t += timedelta(minutes=1)
    return out


class SimFeed:
    name = "sim"

    def __init__(self, symbols: list[str], speed: float = 0.5, start: date | None = None,
                 days: int | None = None, day_pause: float = 8.0, seed: int = 7):
        self.symbols = symbols
        self.speed = speed
        self.day = start or prev_trading_day(datetime.now(ET).date())
        if not is_trading_day(self.day):
            self.day = next_trading_day(self.day)
        self.days = days
        self.day_pause = day_pause
        self.seed = seed
        self.prices = {s: SIM_START.get(s, 100.0) for s in symbols}

    def _session(self, d: date, minutes: list[datetime]) -> list[tuple[datetime, dict[str, Bar]]]:
        rng = random.Random(self.seed * 100003 + d.toordinal())
        sigma = 0.00055  # ~per-minute vol of the common factor
        drift, regime_left = 0.0, 0
        out = []
        n = len(minutes)
        for i, ts in enumerate(minutes):
            if regime_left <= 0:
                regime_left = rng.randint(15, 60)
                drift = rng.choice([-1, 0, 0, 1]) * rng.uniform(0.00012, 0.00035)
            regime_left -= 1
            factor = drift + rng.gauss(0, sigma)
            u = 1.0 + 1.6 * ((i - n / 2) / (n / 2)) ** 2  # U-shaped intraday volume
            bars = {}
            for s in self.symbols:
                p0 = self.prices[s]
                r = SIM_BETA.get(s, 1.0) * factor + rng.gauss(0, sigma * 0.35)
                p1 = p0 * math.exp(r)
                wick = abs(rng.gauss(0, sigma * 0.6)) * p0
                hi = max(p0, p1) + wick * rng.random()
                lo = min(p0, p1) - wick * rng.random()
                vol = int(rng.uniform(0.6, 1.4) * u * {"SPY": 90000, "QQQ": 60000}.get(s, 40000))
                bars[s] = Bar(ts, round(p0, 2), round(hi, 2), round(lo, 2), round(p1, 2), vol)
                self.prices[s] = p1
            out.append((ts, bars))
        return out

    def history(self) -> dict[str, list[Bar]]:
        prior = prev_trading_day(self.day)
        hist = {s: [] for s in self.symbols}
        for _, bars in self._session(prior, session_minutes(prior, time(14, 0))):
            for s, b in bars.items():
                hist[s].append(b)
        return hist

    async def stream(self) -> AsyncIterator[tuple[datetime, dict[str, Bar]]]:
        n = 0
        while self.days is None or n < self.days:
            for ts, bars in self._session(self.day, session_minutes(self.day)):
                yield ts, bars
                await asyncio.sleep(self.speed)
            n += 1
            self.day = next_trading_day(self.day)
            # overnight gap
            gap = random.Random(self.day.toordinal()).gauss(0, 0.004)
            for s in self.symbols:
                self.prices[s] *= math.exp(SIM_BETA.get(s, 1.0) * gap)
            await asyncio.sleep(self.day_pause)


def _alpaca_bars(client, symbols: list[str], start: datetime, end: datetime, feed: str) -> dict[str, list[Bar]]:
    from alpaca.data.enums import DataFeed
    from alpaca.data.requests import StockBarsRequest
    from alpaca.data.timeframe import TimeFrame

    req = StockBarsRequest(symbol_or_symbols=symbols, timeframe=TimeFrame.Minute, start=start, end=end,
                           feed=DataFeed(feed))
    data = client.get_stock_bars(req).data
    out: dict[str, list[Bar]] = {s: [] for s in symbols}
    for s in symbols:
        for b in data.get(s, []):
            out[s].append(Bar(b.timestamp.astimezone(ET), float(b.open), float(b.high), float(b.low),
                              float(b.close), float(b.volume)))
    return out


def _align(by_symbol: dict[str, list[Bar]], minutes: list[datetime],
           last: dict[str, float] | None = None) -> list[tuple[datetime, dict[str, Bar]]]:
    """One bar per symbol per minute; gaps (common on IEX) are filled flat at the last close."""
    index = {s: {b.ts: b for b in bars} for s, bars in by_symbol.items()}
    last = {} if last is None else last
    out = []
    for ts in minutes:
        row = {}
        for s, idx in index.items():
            b = idx.get(ts)
            if b is None:
                if s not in last:
                    continue
                b = Bar(ts, last[s], last[s], last[s], last[s], 0)
            last[s] = b.close
            row[s] = b
        if len(row) == len(index):
            out.append((ts, row))
    return out


class AlpacaReplayFeed:
    name = "alpaca-replay"

    def __init__(self, symbols: list[str], api_key: str, secret_key: str, start: date,
                 days: int = 1, speed: float = 0.5, feed: str = "iex", day_pause: float = 8.0):
        from alpaca.data.historical.stock import StockHistoricalDataClient

        self.client = StockHistoricalDataClient(api_key, secret_key)
        self.symbols = symbols
        self.day = start if is_trading_day(start) else next_trading_day(start)
        self.days = days
        self.speed = speed
        self.feed = feed
        self.day_pause = day_pause

    def _day_bars(self, d: date, start: time = time(9, 30)) -> list[tuple[datetime, dict[str, Bar]]]:
        mins = session_minutes(d, start)
        raw = _alpaca_bars(self.client, self.symbols, mins[0], mins[-1] + timedelta(minutes=1), self.feed)
        return _align(raw, mins)

    def history(self) -> dict[str, list[Bar]]:
        hist = {s: [] for s in self.symbols}
        for _, row in self._day_bars(prev_trading_day(self.day), time(13, 0)):
            for s, b in row.items():
                hist[s].append(b)
        return hist

    async def stream(self) -> AsyncIterator[tuple[datetime, dict[str, Bar]]]:
        for i in range(self.days):
            rows = await asyncio.to_thread(self._day_bars, self.day)
            if not rows:
                log.warning("no bars for %s (holiday or data gap)", self.day)
            for ts, row in rows:
                yield ts, row
                await asyncio.sleep(self.speed)
            self.day = next_trading_day(self.day)
            if i < self.days - 1:
                await asyncio.sleep(self.day_pause)


class AlpacaLiveFeed:
    """Polls REST a few seconds after each minute closes. Simple and robust to reconnects."""

    name = "alpaca-live"

    def __init__(self, symbols: list[str], api_key: str, secret_key: str, feed: str = "iex", lag: float = 4.0):
        from alpaca.data.historical.stock import StockHistoricalDataClient

        self.client = StockHistoricalDataClient(api_key, secret_key)
        self.symbols = symbols
        self.feed = feed
        self.lag = lag
        self.last_ts: datetime | None = None
        self.last_close: dict[str, float] = {}

    def history(self) -> dict[str, list[Bar]]:
        now = datetime.now(ET)
        today = now.date()
        prior = prev_trading_day(today)
        hist = {s: [] for s in self.symbols}
        mins = session_minutes(prior, time(13, 0))
        if is_trading_day(today):
            mins += [m for m in session_minutes(today) if m + timedelta(minutes=1) <= now]
        raw = _alpaca_bars(self.client, self.symbols, mins[0], now, self.feed)
        for ts, row in _align(raw, mins, self.last_close):
            for s, b in row.items():
                hist[s].append(b)
            self.last_ts = ts
        return hist

    async def stream(self) -> AsyncIterator[tuple[datetime, dict[str, Bar]]]:
        while True:
            now = datetime.now(ET)
            nxt = now.replace(second=0, microsecond=0) + timedelta(minutes=1)
            await asyncio.sleep((nxt - now).total_seconds() + self.lag)
            now = datetime.now(ET)
            closed = now.replace(second=0, microsecond=0)  # bars strictly before this are complete
            mins = [m for m in session_minutes(closed.date()) if m < closed and (self.last_ts is None or m > self.last_ts)]
            if not mins:
                continue
            try:
                raw = await asyncio.to_thread(_alpaca_bars, self.client, self.symbols, mins[0], closed, self.feed)
            except Exception:  # noqa: BLE001 - keep polling through transient API errors
                log.exception("bar poll failed")
                continue
            for ts, row in _align(raw, mins, self.last_close):
                self.last_ts = ts
                yield ts, row
