"""Pull assumable-loan details out of free-text listing remarks.

Agents usually advertise assumable loans in the public remarks, e.g.
"Assumable VA loan at 2.375% with ~$310k balance". These helpers turn that
text into structured fields.
"""
from __future__ import annotations

import re

STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "district of columbia": "DC",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY", "louisiana": "LA",
    "maine": "ME", "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
    "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA",
    "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
}
STATE_CODES = set(STATES.values())

ASSUMABLE_RE = re.compile(r"\bassum(?:able|e|ption)\b", re.I)
NOT_ASSUMABLE_RE = re.compile(r"\b(?:not|non)[\s-]?assumable\b", re.I)

_PCT = r"(\d(?:\.\d{1,3})?)\s*%"
RATE_PATTERNS = [
    # "2.75% assumable", "2.75% VA loan", "2.75% interest rate", "2.75% fixed"
    re.compile(_PCT + r"\s*(?:assum|interest|rate|fixed|fha|va\b|usda|loan|mortgage|apr)", re.I),
    # "rate of 2.75%", "assumable at 2.75%", "interest rate: 2.75%"
    re.compile(r"(?:rate|assumable|interest|at)\D{0,25}?" + _PCT, re.I),
]

LOAN_TYPE_RE = re.compile(r"\b(FHA|VA|USDA|conventional)\b(?=[^.]{0,60}\b(?:loan|mortgage|assum|financ))|"
                          r"\bassum\w*\s+(FHA|VA|USDA|conventional)\b", re.I)

MONEY = r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\b"
BALANCE_RE = re.compile(r"(?:balance|owed?|payoff|principal|loan amount)\D{0,30}?" + MONEY, re.I)
BALANCE_BEFORE_RE = re.compile(MONEY + r"\s*(?:remaining\s+)?(?:loan\s+)?(?:balance|owed|payoff)", re.I)
PAYMENT_RE = re.compile(r"(?:payment|p\s?&\s?i|piti)\D{0,25}?" + MONEY, re.I)


def _money(num: str, suffix: str | None) -> float:
    value = float(num.replace(",", ""))
    if suffix and suffix.lower() == "k":
        value *= 1_000
    elif suffix and suffix.lower() == "m":
        value *= 1_000_000
    return value


def parse_money(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?", text.replace("$", ""))
    return _money(m.group(1), m.group(2)) if m else None


def parse_number(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"\d[\d,]*(?:\.\d+)?", text)
    return float(m.group(0).replace(",", "")) if m else None


def is_assumable(text: str) -> bool:
    return bool(ASSUMABLE_RE.search(text or "")) and not NOT_ASSUMABLE_RE.search(text or "")


def extract_rate(text: str) -> float | None:
    for pattern in RATE_PATTERNS:
        for m in pattern.finditer(text or ""):
            rate = float(m.group(1))
            if 0.5 <= rate <= 9.5:  # plausible mortgage rate, skips "3% commission" style noise poorly but cheaply
                return rate
    return None


def extract_loan_type(text: str) -> str:
    m = LOAN_TYPE_RE.search(text or "")
    if not m:
        return "Unknown"
    value = (m.group(1) or m.group(2)).upper()
    return "Conventional" if value == "CONVENTIONAL" else value


def extract_balance(text: str) -> float | None:
    for pattern in (BALANCE_RE, BALANCE_BEFORE_RE):
        m = pattern.search(text or "")
        if m:
            value = _money(m.group(1), m.group(2))
            if value >= 10_000:
                return value
    return None


def extract_payment(text: str) -> float | None:
    m = PAYMENT_RE.search(text or "")
    if m:
        value = _money(m.group(1), m.group(2))
        if 200 <= value <= 20_000:
            return value
    return None


def normalize_state(value: str | None) -> str:
    if not value:
        return ""
    v = value.strip()
    if v.upper() in STATE_CODES:
        return v.upper()
    return STATES.get(v.lower(), "")


def parse_city_state_zip(text: str) -> tuple[str, str, str]:
    """'Phoenix, AZ 85001' -> ('Phoenix', 'AZ', '85001')."""
    m = re.search(r"([A-Za-z .'-]+),\s*([A-Za-z]{2}|[A-Za-z ]+?)\s*(\d{5})?(?:-\d{4})?\s*$", text or "")
    if not m:
        return "", "", ""
    return m.group(1).strip(), normalize_state(m.group(2)), m.group(3) or ""


def enrich(listing, text: str) -> None:
    """Fill missing loan fields on a Listing from free text."""
    if listing.interest_rate is None:
        listing.interest_rate = extract_rate(text)
    if listing.loan_type == "Unknown":
        listing.loan_type = extract_loan_type(text)
    if listing.loan_balance is None:
        listing.loan_balance = extract_balance(text)
    if listing.monthly_pi is None:
        listing.monthly_pi = extract_payment(text)
