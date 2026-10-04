"""AlpacaBroker against stub clients (no network)."""
from datetime import date, datetime
from types import SimpleNamespace as NS

from alpaca.trading.enums import OrderSide, OrderStatus

from scalpcity.broker import AlpacaBroker
from scalpcity.options import ET


class StubTrading:
    def __init__(self):
        self.orders = {}
        self.requests = []

    def get_calendar(self, req):
        return [NS(date=date(2026, 10, 5))]

    def get_option_contracts(self, req):
        self.requests.append(req)
        strikes = [750, 751, 752, 753, 754]
        kind = "C" if req.type.value == "call" else "P"
        return NS(option_contracts=[NS(symbol=f"QQQ261005{kind}{s * 1000:08d}", strike_price=float(s)) for s in strikes])

    def submit_order(self, req):
        oid = f"o{len(self.orders)}"
        self.orders[oid] = req
        return NS(id=oid)

    def get_order_by_id(self, oid):
        req = self.orders[oid]
        return NS(id=oid, status=OrderStatus.FILLED, filled_avg_price="3.10" if req.side == OrderSide.BUY else "3.60")


class StubData:
    def get_option_latest_quote(self, req):
        sym = req.symbol_or_symbols
        return {sym: NS(bid_price=2.95, ask_price=3.05)}


def make():
    b = AlpacaBroker.__new__(AlpacaBroker)
    b.trading, b.options_data, b.fill_timeout, b._expiry_cache = StubTrading(), StubData(), 2, {}
    return b


def test_buy_picks_1dte_atm_and_sizes_by_ask():
    b = make()
    fill = b.buy("QQQ", "call", 752.4, datetime(2026, 10, 2, 10, 0, tzinfo=ET), budget=1500, max_contracts=25)
    assert fill.contract == "QQQ261005C00753000" and fill.expiry == date(2026, 10, 5)
    assert fill.qty == 4 and fill.price == 3.10  # floor(1500 / 305)
    req = b.trading.orders["o0"]
    assert req.side == OrderSide.BUY and req.qty == 4 and req.time_in_force.value == "day"


def test_mark_is_mid_and_sell_returns_fill():
    b = make()
    assert b.mark("QQQ261005P00752000", 752, None) == 3.0
    assert b.sell("QQQ261005P00752000", 4, 752, None) == 3.60
    assert b.trading.orders["o0"].side == OrderSide.SELL
