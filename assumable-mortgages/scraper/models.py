from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

LOAN_TYPES = ("FHA", "VA", "USDA", "Conventional", "Unknown")


def monthly_payment(principal: float, annual_rate_pct: float, years: float) -> float:
    """Standard amortized principal & interest payment."""
    n = max(1, round(years * 12))
    r = annual_rate_pct / 100 / 12
    if r == 0:
        return principal / n
    return principal * r / (1 - (1 + r) ** -n)


@dataclass
class Listing:
    source: str
    url: str
    address: str = ""
    city: str = ""
    state: str = ""  # two-letter code
    zip: str = ""
    price: float | None = None
    beds: float | None = None
    baths: float | None = None
    sqft: int | None = None
    year_built: int | None = None
    property_type: str = ""
    loan_type: str = "Unknown"
    interest_rate: float | None = None  # percent, e.g. 2.75
    loan_balance: float | None = None
    remaining_term_years: float | None = None
    monthly_pi: float | None = None  # principal & interest on the assumable loan
    hoa_monthly: float | None = None
    lat: float | None = None
    lng: float | None = None
    description: str = ""
    listed_date: str = ""
    scraped_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))
    id: str = ""
    # Derived
    equity_gap: float | None = None  # cash (or 2nd loan) needed to cover price - balance
    equity_gap_pct: float | None = None

    def finalize(self) -> "Listing":
        if not self.id:
            key = f"{self.address}|{self.city}|{self.state}|{self.zip}".lower() or self.url
            self.id = hashlib.sha1(key.encode()).hexdigest()[:12]
        if self.loan_type not in LOAN_TYPES:
            self.loan_type = "Unknown"
        if self.price and self.loan_balance is not None:
            self.equity_gap = max(0.0, self.price - self.loan_balance)
            self.equity_gap_pct = round(self.equity_gap / self.price * 100, 1)
        if (
            self.monthly_pi is None
            and self.loan_balance
            and self.interest_rate is not None
            and self.remaining_term_years
        ):
            self.monthly_pi = round(monthly_payment(self.loan_balance, self.interest_rate, self.remaining_term_years), 2)
        return self

    def to_dict(self) -> dict:
        return asdict(self)
