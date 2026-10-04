"""Worker (bot) definitions and risk settings.

Override any of these with a JSON file passed via --config, e.g.

    {"risk": {"budget_per_trade": 800, "daily_goal": 400},
     "workers": [{"id": "qqq-vwap", "name": "QQQ", "symbol": "QQQ", "triggers": ["vwap"]}]}
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field, fields
from datetime import time
from pathlib import Path

TRIGGERS = ("vwap", "ema50", "orb")


@dataclass
class WorkerConfig:
    id: str
    name: str
    symbol: str
    triggers: list[str]


@dataclass
class RiskConfig:
    budget_per_trade: float = 1500.0  # $ of premium per entry
    max_contracts: int = 25
    take_profit_pct: float = 0.25  # premium +25% -> start trailing ("profit locked")
    trail_pct: float = 0.10  # give back 10% from the high-water mark once trailing
    stop_loss_pct: float = 0.18  # premium -18% -> "stopped out"
    fade_atr: float = 0.35  # underlying closes this many ATR back through the trigger -> "reversal" exit
    max_hold_minutes: int = 30
    cooldown_minutes: int = 5  # wait after each trade before taking another
    daily_goal: float = 500.0  # per worker: hit this and clock out for the day
    daily_max_loss: float = 400.0  # per worker: lose this and get benched for the day
    squeeze_atr: float = 0.12  # |EMA9 - EMA21| below this many ATR = chop, skip VWAP crosses
    charge_window_atr: float = 1.0  # beam starts charging when price is within this many ATR of a trigger
    orb_minutes: int = 15
    entry_start: time = time(9, 35)
    entry_end: time = time(15, 30)
    flatten_at: time = time(15, 55)


DEFAULT_WORKERS = [
    WorkerConfig("qqq-orb", "QQQ ORB", "QQQ", ["orb"]),
    WorkerConfig("qqq-trend", "QQQ TREND", "QQQ", ["ema50"]),
    WorkerConfig("qqq-vwap", "QQQ", "QQQ", ["vwap"]),
    WorkerConfig("spy", "SPY", "SPY", ["vwap", "ema50", "orb"]),
    WorkerConfig("iwm", "IWM", "IWM", ["vwap", "ema50", "orb"]),
]


@dataclass
class Config:
    risk: RiskConfig = field(default_factory=RiskConfig)
    workers: list[WorkerConfig] = field(default_factory=lambda: list(DEFAULT_WORKERS))

    @property
    def symbols(self) -> list[str]:
        return sorted({w.symbol for w in self.workers})

    def to_dict(self) -> dict:
        d = asdict(self)
        for k, v in d["risk"].items():
            if isinstance(v, time):
                d["risk"][k] = v.strftime("%H:%M")
        return d


def load_config(path: str | None) -> Config:
    cfg = Config()
    if not path:
        return cfg
    raw = json.loads(Path(path).read_text())
    risk_fields = {f.name: f for f in fields(RiskConfig)}
    for k, v in raw.get("risk", {}).items():
        if k not in risk_fields:
            raise ValueError(f"unknown risk setting: {k}")
        if risk_fields[k].type in ("time", time):
            h, m = v.split(":")
            v = time(int(h), int(m))
        setattr(cfg.risk, k, v)
    if "workers" in raw:
        cfg.workers = [WorkerConfig(**w) for w in raw["workers"]]
    for w in cfg.workers:
        bad = set(w.triggers) - set(TRIGGERS)
        if bad:
            raise ValueError(f"worker {w.id}: unknown triggers {bad}")
    return cfg
