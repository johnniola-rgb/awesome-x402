"""Command line entry point.

    python -m scraper run --config sources.json      # scrape configured sources
    python -m scraper sample --count 400             # write demo data
    python -m scraper import-csv export.csv          # import a CSV export
"""
from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from .http import DEFAULT_UA, PoliteSession
from .sources import SOURCE_TYPES

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "dashboard" / "data" / "listings.json"
log = logging.getLogger("scraper")


def collect(source_cfgs: list[dict], session: PoliteSession) -> list[dict]:
    seen: dict[str, dict] = {}
    for cfg in source_cfgs:
        if cfg.get("enabled") is False:
            continue
        source = SOURCE_TYPES[cfg["type"]](cfg, session)
        count = 0
        try:
            for listing in source.fetch():
                # Later sources win on duplicates, but keep any field the newer record lacks
                record = listing.to_dict()
                for key, value in seen.get(listing.id, {}).items():
                    if record.get(key) in (None, ""):
                        record[key] = value
                seen[listing.id] = record
                count += 1
        except Exception as exc:
            log.error("source %s failed: %s", cfg.get("name", cfg["type"]), exc)
        log.info("%s: %d listings", cfg.get("name", cfg["type"]), count)
    return list(seen.values())


def write(listings: list[dict], out: Path, merge: bool) -> None:
    if merge and out.exists():
        existing = {item["id"]: item for item in json.loads(out.read_text())["listings"]}
        existing.update({item["id"]: item for item in listings})
        listings = list(existing.values())
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": sorted({item["source"] for item in listings}),
        "count": len(listings),
        "listings": listings,
    }
    out.write_text(json.dumps(payload, indent=1))
    log.info("wrote %d listings to %s", len(listings), out)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="scraper", description="Assumable mortgage listing scraper")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output JSON (default: dashboard/data/listings.json)")
    parser.add_argument("--merge", action="store_true", help="merge into existing output instead of replacing it")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="cmd", required=True)

    run = sub.add_parser("run", help="scrape every source in a config file")
    run.add_argument("--config", type=Path, default=Path("sources.json"))
    run.add_argument("--delay", type=float, default=3.0, help="seconds between requests to the same host")

    sample = sub.add_parser("sample", help="generate demo listings")
    sample.add_argument("--count", type=int, default=400)
    sample.add_argument("--seed", type=int, default=42)

    imp = sub.add_parser("import-csv", help="import a CSV export")
    imp.add_argument("path")
    imp.add_argument("--name", default="csv")

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO, format="%(levelname)s %(message)s")

    session = PoliteSession(user_agent=os.environ.get("USER_AGENT", DEFAULT_UA), delay=getattr(args, "delay", 3.0))
    if args.cmd == "run":
        cfgs = json.loads(args.config.read_text())["sources"]
    elif args.cmd == "sample":
        cfgs = [{"type": "sample", "count": args.count, "seed": args.seed}]
    else:
        cfgs = [{"type": "csv", "path": args.path, "name": args.name}]
    write(collect(cfgs, session), args.out, args.merge)
