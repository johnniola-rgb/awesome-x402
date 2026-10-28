"""Selector-driven HTML scraper.

Point it at any listing site you are permitted to scrape by describing the
page structure in sources.json (see sources.example.json). Each result card is
turned into a Listing; card text (and optionally the detail page) is mined for
rate / loan type / balance mentions.
"""
from __future__ import annotations

import logging
from typing import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .. import extract
from ..http import PoliteSession, RobotsDisallowed
from ..models import Listing

log = logging.getLogger(__name__)

NUMERIC = {"beds", "baths", "sqft", "year_built", "interest_rate", "remaining_term_years", "lat", "lng"}
MONEY = {"price", "loan_balance", "monthly_pi", "hoa_monthly"}


class HtmlConfigSource:
    def __init__(self, cfg: dict, session: PoliteSession):
        self.cfg = cfg
        self.name = cfg["name"]
        self.session = session

    def _text(self, node, selector: str | None) -> str:
        if not selector:
            return ""
        attr = None
        if "@" in selector:  # "a.link@href" reads an attribute
            selector, attr = selector.rsplit("@", 1)
        el = node.select_one(selector) if selector else node
        if el is None:
            return ""
        return (el.get(attr) or "") if attr else el.get_text(" ", strip=True)

    def _build(self, card, page_url: str) -> Listing | None:
        fields: dict = self.cfg["fields"]
        raw = {key: self._text(card, sel) for key, sel in fields.items()}
        url = urljoin(page_url, raw.pop("url", "") or page_url)
        listing = Listing(source=self.name, url=url)
        for key, value in raw.items():
            if not value:
                continue
            if key in MONEY:
                setattr(listing, key, extract.parse_money(value))
            elif key in NUMERIC:
                num = extract.parse_number(value)
                setattr(listing, key, int(num) if key in ("sqft", "year_built") and num else num)
            elif key == "state":
                listing.state = extract.normalize_state(value)
            elif key == "city_state_zip":
                listing.city, listing.state, listing.zip = extract.parse_city_state_zip(value)
            elif key == "loan_type":
                listing.loan_type = extract.extract_loan_type(value + " loan")
            elif hasattr(listing, key):
                setattr(listing, key, value)

        text = card.get_text(" ", strip=True)
        if self.cfg.get("follow_detail") and url != page_url:
            try:
                detail = BeautifulSoup(self.session.get(url).text, "html.parser")
                sel = self.cfg.get("detail_description")
                text = self._text(detail, sel) if sel else detail.get_text(" ", strip=True)
                listing.description = listing.description or text[:2000]
            except Exception as exc:  # keep going on a bad detail page
                log.warning("detail fetch failed for %s: %s", url, exc)

        if self.cfg.get("require_assumable_mention", True) and not extract.is_assumable(text):
            return None
        extract.enrich(listing, text)
        return listing.finalize()

    def fetch(self) -> Iterator[Listing]:
        max_pages = self.cfg.get("max_pages", 5)
        for start in self.cfg["start_urls"]:
            url, pages = start, 0
            while url and pages < max_pages:
                try:
                    resp = self.session.get(url)
                except RobotsDisallowed:
                    log.warning("robots.txt disallows %s — skipping", url)
                    break
                soup = BeautifulSoup(resp.text, "html.parser")
                cards = soup.select(self.cfg["item_selector"])
                log.info("%s: %d cards on %s", self.name, len(cards), url)
                for card in cards:
                    listing = self._build(card, url)
                    if listing:
                        yield listing
                pages += 1
                nxt = self.cfg.get("next_selector")
                link = soup.select_one(nxt) if nxt else None
                url = urljoin(url, link["href"]) if link and link.get("href") else None
