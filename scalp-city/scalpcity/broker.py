"""Brokers: a Black-Scholes simulator and Alpaca paper trading.

Both expose the same three calls the workers use:
    buy(...)  -> Fill | None
    mark(...) -> float  (current premium per share)
    sell(...) -> float  (exit premium per share)
"""
from __future__ import annotations

import logging
import math
import time as _time
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .options import bs_price, next_trading_day, occ_symbol, pick_strike, years_to_expiry

log = logging.getLogger(__name__)


@dataclass
class Fill:
    contract: str
    strike: float
    expiry: date
    qty: int
    price: float  # premium per share


def size_position(premium: float, budget: float, max_contracts: int) -> int:
    if premium <= 0:
        return 0
    return max(0, min(max_contracts, math.floor(budget / (premium * 100))))


class SimBroker:
    """Fills at Black-Scholes value plus a half-spread; good for replays and demos."""

    name = "sim"

    def __init__(self, iv: dict[str, float] | None = None, half_spread: float = 0.01):
        self.iv = iv or {"QQQ": 0.20, "SPY": 0.15, "IWM": 0.24}
        self.half_spread = half_spread

    def _value(self, contract: str, spot: float, ts: datetime) -> float:
        root, expiry, side, strike = parse_occ(contract)
        t = years_to_expiry(ts, expiry)
        return bs_price(spot, strike, t, self.iv.get(root, 0.2), side)

    def buy(self, underlying: str, side: str, spot: float, ts: datetime, budget: float, max_contracts: int) -> Fill | None:
        expiry = next_trading_day(ts.date())
        strike = pick_strike(spot, side)
        contract = occ_symbol(underlying, expiry, side, strike)
        price = round(self._value(contract, spot, ts) * (1 + self.half_spread), 2)
        qty = size_position(price, budget, max_contracts)
        if qty == 0:
            return None
        return Fill(contract, strike, expiry, qty, price)

    def mark(self, contract: str, spot: float, ts: datetime) -> float:
        return self._value(contract, spot, ts)

    def sell(self, contract: str, qty: int, spot: float, ts: datetime) -> float:
        return round(self._value(contract, spot, ts) * (1 - self.half_spread), 2)


def parse_occ(contract: str) -> tuple[str, date, str, float]:
    root = contract[:-15]
    tail = contract[-15:]
    expiry = datetime.strptime(tail[:6], "%y%m%d").date()
    side = "call" if tail[6] == "C" else "put"
    strike = int(tail[7:]) / 1000
    return root, expiry, side, strike


class AlpacaBroker:
    """Routes orders to an Alpaca *paper* account. Live trading is intentionally not supported."""

    name = "alpaca-paper"

    def __init__(self, api_key: str, secret_key: str, fill_timeout: float = 15.0):
        from alpaca.data.historical.option import OptionHistoricalDataClient
        from alpaca.trading.client import TradingClient

        self.trading = TradingClient(api_key, secret_key, paper=True)
        self.options_data = OptionHistoricalDataClient(api_key, secret_key)
        self.fill_timeout = fill_timeout
        self._expiry_cache: dict[date, date] = {}

    def account(self) -> dict:
        a = self.trading.get_account()
        return {"equity": float(a.equity), "buying_power": float(a.buying_power),
                "options_level": getattr(a, "options_trading_level", None)}

    def next_session(self, today: date) -> date:
        if today not in self._expiry_cache:
            from alpaca.trading.requests import GetCalendarRequest

            cal = self.trading.get_calendar(GetCalendarRequest(start=today + timedelta(days=1), end=today + timedelta(days=10)))
            self._expiry_cache[today] = cal[0].date if cal else next_trading_day(today)
        return self._expiry_cache[today]

    def _quote(self, contract: str) -> tuple[float, float]:
        from alpaca.data.requests import OptionLatestQuoteRequest

        q = self.options_data.get_option_latest_quote(OptionLatestQuoteRequest(symbol_or_symbols=contract))[contract]
        return float(q.bid_price or 0), float(q.ask_price or 0)

    def _find_contract(self, underlying: str, side: str, spot: float, expiry: date):
        from alpaca.trading.enums import AssetStatus, ContractType
        from alpaca.trading.requests import GetOptionContractsRequest

        req = GetOptionContractsRequest(
            underlying_symbols=[underlying],
            status=AssetStatus.ACTIVE,
            expiration_date=expiry,
            type=ContractType.CALL if side == "call" else ContractType.PUT,
            strike_price_gte=str(math.floor(spot - 5)),
            strike_price_lte=str(math.ceil(spot + 5)),
            limit=100,
        )
        contracts = self.trading.get_option_contracts(req).option_contracts or []
        if not contracts:
            return None
        target = pick_strike(spot, side)
        return min(contracts, key=lambda c: (abs(float(c.strike_price) - target), float(c.strike_price)))

    def _submit_and_wait(self, contract: str, qty: int, buy: bool) -> float | None:
        from alpaca.trading.enums import OrderSide, OrderStatus, TimeInForce
        from alpaca.trading.requests import MarketOrderRequest

        order = self.trading.submit_order(MarketOrderRequest(
            symbol=contract, qty=qty, side=OrderSide.BUY if buy else OrderSide.SELL, time_in_force=TimeInForce.DAY,
        ))
        deadline = _time.monotonic() + self.fill_timeout
        while _time.monotonic() < deadline:
            o = self.trading.get_order_by_id(order.id)
            if o.status == OrderStatus.FILLED:
                return float(o.filled_avg_price)
            if o.status in (OrderStatus.CANCELED, OrderStatus.REJECTED, OrderStatus.EXPIRED):
                log.warning("order %s for %s ended %s", o.id, contract, o.status)
                return None
            _time.sleep(0.5)
        log.warning("order %s for %s not filled in %.0fs, cancelling", order.id, contract, self.fill_timeout)
        try:
            self.trading.cancel_order_by_id(order.id)
        except Exception:  # noqa: BLE001 - it may have filled in the meantime
            pass
        o = self.trading.get_order_by_id(order.id)
        return float(o.filled_avg_price) if o.status == OrderStatus.FILLED else None

    def buy(self, underlying: str, side: str, spot: float, ts: datetime, budget: float, max_contracts: int) -> Fill | None:
        expiry = self.next_session(ts.date())  # 1DTE
        c = self._find_contract(underlying, side, spot, expiry)
        if c is None:
            log.warning("no %s %s contracts expiring %s near %.2f", underlying, side, expiry, spot)
            return None
        bid, ask = self._quote(c.symbol)
        qty = size_position(ask, budget, max_contracts)
        if qty == 0:
            return None
        price = self._submit_and_wait(c.symbol, qty, buy=True)
        if price is None:
            return None
        return Fill(c.symbol, float(c.strike_price), expiry, qty, price)

    def mark(self, contract: str, spot: float, ts: datetime) -> float:
        bid, ask = self._quote(contract)
        if bid and ask:
            return (bid + ask) / 2
        return bid or ask

    def sell(self, contract: str, qty: int, spot: float, ts: datetime) -> float:
        price = self._submit_and_wait(contract, qty, buy=False)
        if price is None:
            # Fall back to closing the whole position so nothing is left dangling.
            self.trading.close_position(contract)
            _time.sleep(1.0)
            return self.mark(contract, spot, ts)
        return price
