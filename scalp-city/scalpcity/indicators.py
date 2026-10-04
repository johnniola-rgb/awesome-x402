"""Incremental indicators computed one 1-minute bar at a time."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time


@dataclass(frozen=True)
class Bar:
    ts: datetime  # bar open time, tz-aware (America/New_York)
    open: float
    high: float
    low: float
    close: float
    volume: float


class EMA:
    def __init__(self, period: int):
        self.period = period
        self.k = 2.0 / (period + 1)
        self.value: float | None = None
        self.count = 0

    def update(self, x: float) -> float:
        self.count += 1
        self.value = x if self.value is None else self.value + self.k * (x - self.value)
        return self.value

    @property
    def ready(self) -> bool:
        return self.count >= self.period


class ATR:
    """Wilder's average true range."""

    def __init__(self, period: int = 14):
        self.period = period
        self.value: float | None = None
        self.prev_close: float | None = None
        self.count = 0
        self._seed: list[float] = []

    def update(self, high: float, low: float, close: float) -> float | None:
        if self.prev_close is None:
            tr = high - low
        else:
            tr = max(high - low, abs(high - self.prev_close), abs(low - self.prev_close))
        self.prev_close = close
        self.count += 1
        if self.value is None:
            self._seed.append(tr)
            if len(self._seed) >= self.period:
                self.value = sum(self._seed) / len(self._seed)
        else:
            self.value = (self.value * (self.period - 1) + tr) / self.period
        return self.value


class SessionVWAP:
    """VWAP anchored to the regular-session open; call reset() each new day."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.pv = 0.0
        self.vol = 0.0
        self.value: float | None = None

    def update(self, high: float, low: float, close: float, volume: float) -> float | None:
        typical = (high + low + close) / 3
        v = max(volume, 1.0)
        self.pv += typical * v
        self.vol += v
        self.value = self.pv / self.vol
        return self.value


SESSION_OPEN = time(9, 30)
SESSION_CLOSE = time(16, 0)


class OpeningRange:
    """High/low of the first `minutes` of the regular session."""

    def __init__(self, minutes: int = 15):
        self.minutes = minutes
        self.reset()

    def reset(self):
        self.high: float | None = None
        self.low: float | None = None
        self.ready = False

    def update(self, bar: Bar):
        t = bar.ts.time()
        mins = (t.hour * 60 + t.minute) - (SESSION_OPEN.hour * 60 + SESSION_OPEN.minute)
        if 0 <= mins < self.minutes:
            self.high = bar.high if self.high is None else max(self.high, bar.high)
            self.low = bar.low if self.low is None else min(self.low, bar.low)
        elif mins >= self.minutes and self.high is not None:
            self.ready = True


def in_session(ts: datetime) -> bool:
    return SESSION_OPEN <= ts.time() < SESSION_CLOSE
