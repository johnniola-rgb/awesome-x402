"""A polite HTTP client: honours robots.txt, rate-limits per host, retries."""
from __future__ import annotations

import time
import urllib.robotparser
from urllib.parse import urlparse

import requests

DEFAULT_UA = "AssumableMortgageScraper/1.0 (+personal research; contact: set USER_AGENT)"


class RobotsDisallowed(Exception):
    pass


class PoliteSession:
    def __init__(self, user_agent: str = DEFAULT_UA, delay: float = 3.0, timeout: float = 20.0, retries: int = 3):
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent, "Accept-Language": "en-US,en;q=0.9"})
        self.user_agent = user_agent
        self.delay = delay
        self.timeout = timeout
        self.retries = retries
        self._robots: dict[str, urllib.robotparser.RobotFileParser] = {}
        self._last_hit: dict[str, float] = {}

    def allowed(self, url: str) -> bool:
        parts = urlparse(url)
        root = f"{parts.scheme}://{parts.netloc}"
        if root not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                resp = self.session.get(root + "/robots.txt", timeout=self.timeout)
                rp.parse(resp.text.splitlines() if resp.ok else [])
            except requests.RequestException:
                rp.parse([])
            self._robots[root] = rp
        return self._robots[root].can_fetch(self.user_agent, url)

    def get(self, url: str) -> requests.Response:
        if not self.allowed(url):
            raise RobotsDisallowed(url)
        host = urlparse(url).netloc
        wait = self._last_hit.get(host, 0) + self.delay - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        last_exc: Exception | None = None
        for attempt in range(self.retries):
            try:
                resp = self.session.get(url, timeout=self.timeout)
                self._last_hit[host] = time.monotonic()
                if resp.status_code in (429, 503):
                    time.sleep(self.delay * (2 ** attempt))
                    continue
                resp.raise_for_status()
                return resp
            except requests.RequestException as exc:
                last_exc = exc
                time.sleep(self.delay * (2 ** attempt))
        raise last_exc or RuntimeError(f"Failed to fetch {url}")
