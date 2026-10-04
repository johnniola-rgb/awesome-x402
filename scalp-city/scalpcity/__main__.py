"""python -m scalpcity [--mode sim|replay|paper] ..."""
from __future__ import annotations

import argparse
import logging
import os
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path: Path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def main():
    load_dotenv(ROOT / ".env")
    ap = argparse.ArgumentParser(prog="scalpcity", description="1DTE options scalping bots with a 3D dashboard")
    ap.add_argument("--mode", choices=["sim", "replay", "paper"], default="sim",
                    help="sim: synthetic market + simulated fills (no keys). "
                         "replay: real Alpaca historical bars + simulated fills. "
                         "paper: live Alpaca bars + real orders on your Alpaca paper account.")
    ap.add_argument("--config", help="JSON file overriding risk settings / workers")
    ap.add_argument("--speed", type=float, default=0.4, help="seconds per 1-minute bar in sim/replay")
    ap.add_argument("--date", type=date.fromisoformat, help="first session to replay/simulate (YYYY-MM-DD)")
    ap.add_argument("--days", type=int, help="number of sessions to replay/simulate (default: 5 replay, endless sim)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8402)
    ap.add_argument("--history", default=None, help="where to keep daily results (default data/history-<mode>.json)")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    import uvicorn

    from .broker import AlpacaBroker, SimBroker
    from .config import load_config
    from .engine import Engine
    from .feeds import AlpacaLiveFeed, AlpacaReplayFeed, SimFeed
    from .server import create_app

    cfg = load_config(args.config)
    key, secret = os.environ.get("ALPACA_API_KEY", ""), os.environ.get("ALPACA_SECRET_KEY", "")
    data_feed = os.environ.get("ALPACA_DATA_FEED", "iex")
    if args.mode != "sim" and not (key and secret):
        ap.error(f"--mode {args.mode} needs ALPACA_API_KEY and ALPACA_SECRET_KEY (env or .env)")

    if args.mode == "sim":
        feed = SimFeed(cfg.symbols, speed=args.speed, start=args.date, days=args.days)
        broker = SimBroker()
    elif args.mode == "replay":
        from .options import ET, prev_trading_day

        days = args.days or 5
        start = args.date
        if start is None:
            start = datetime.now(ET).date()
            for _ in range(days):
                start = prev_trading_day(start)
        feed = AlpacaReplayFeed(cfg.symbols, key, secret, start, days=days, speed=args.speed, feed=data_feed)
        broker = SimBroker()
    else:
        feed = AlpacaLiveFeed(cfg.symbols, key, secret, feed=data_feed)
        broker = AlpacaBroker(key, secret)
        acct = broker.account()
        logging.info("Alpaca paper account: equity $%.2f, options level %s", acct["equity"], acct["options_level"])

    history = Path(args.history) if args.history else ROOT / "data" / f"history-{args.mode}.json"
    engine = Engine(cfg, broker, feed, history_path=history, mode=args.mode)
    print(f"\n  Scalp City ({args.mode}) → http://{args.host}:{args.port}\n")
    uvicorn.run(create_app(engine), host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
