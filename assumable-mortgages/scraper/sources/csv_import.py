"""Import listings from a CSV export (MLS search export, spreadsheet, etc.).

Column names are matched loosely, so exports from most tools work as-is.
Rows whose remarks don't mention an assumable loan are dropped unless the
loan_type column says FHA/VA/USDA.
"""
from __future__ import annotations

import csv
from typing import Iterator

from .. import extract
from ..models import Listing

ALIASES = {
    "url": ["url", "link", "listing url", "listing_url"],
    "address": ["address", "street", "street address", "address line 1"],
    "city": ["city"],
    "state": ["state", "st", "state or province"],
    "zip": ["zip", "zipcode", "zip code", "postal code"],
    "price": ["price", "list price", "listprice", "asking price"],
    "beds": ["beds", "bedrooms", "br", "bedrooms total"],
    "baths": ["baths", "bathrooms", "ba", "bathrooms total"],
    "sqft": ["sqft", "square feet", "living area", "sq ft"],
    "year_built": ["year built", "year_built", "yearbuilt"],
    "property_type": ["property type", "type", "property_type", "property sub type"],
    "loan_type": ["loan type", "loan_type", "financing", "existing financing"],
    "interest_rate": ["interest rate", "rate", "interest_rate", "assumable rate"],
    "loan_balance": ["loan balance", "balance", "loan_balance", "remaining balance"],
    "remaining_term_years": ["remaining term", "remaining_term_years", "years remaining"],
    "monthly_pi": ["monthly payment", "monthly_pi", "p&i", "payment"],
    "hoa_monthly": ["hoa", "hoa fee", "hoa_monthly", "association fee"],
    "lat": ["lat", "latitude"],
    "lng": ["lng", "lon", "longitude"],
    "description": ["description", "remarks", "public remarks", "notes"],
    "listed_date": ["listed date", "list date", "listed_date", "listing date"],
}
MONEY = {"price", "loan_balance", "monthly_pi", "hoa_monthly"}
NUMBERS = {"beds", "baths", "sqft", "year_built", "interest_rate", "remaining_term_years", "lat", "lng"}


class CsvSource:
    def __init__(self, cfg: dict, session=None):
        self.cfg = cfg
        self.name = cfg.get("name", "csv")
        self.path = cfg["path"]

    def fetch(self) -> Iterator[Listing]:
        with open(self.path, newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            lookup = {h.strip().lower(): h for h in reader.fieldnames or []}
            columns = {
                field: next((lookup[a] for a in names if a in lookup), None) for field, names in ALIASES.items()
            }
            for row in reader:
                listing = Listing(source=self.name, url="")
                for field, col in columns.items():
                    value = (row.get(col) or "").strip() if col else ""
                    if not value:
                        continue
                    if field in MONEY:
                        setattr(listing, field, extract.parse_money(value))
                    elif field in NUMBERS:
                        num = extract.parse_number(value)
                        setattr(listing, field, int(num) if field in ("sqft", "year_built") and num else num)
                    elif field == "state":
                        listing.state = extract.normalize_state(value)
                    elif field == "loan_type":
                        listing.loan_type = extract.extract_loan_type(value + " loan")
                    else:
                        setattr(listing, field, value)
                text = " ".join(str(v) for v in row.values() if v)
                if listing.loan_type not in ("FHA", "VA", "USDA") and not extract.is_assumable(text):
                    continue
                extract.enrich(listing, text)
                yield listing.finalize()
