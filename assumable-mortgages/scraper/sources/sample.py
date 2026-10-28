"""Synthetic demo listings so the dashboard works before you configure a real source.

Every record is tagged source="sample" and the dashboard labels it as demo data.
"""
from __future__ import annotations

import random
from datetime import date, timedelta
from typing import Iterator

from ..models import Listing, monthly_payment

# (city, state, zip prefix, median price) — weighted roughly toward states with the most FHA/VA inventory
MARKETS = [
    ("San Antonio", "TX", "782", 310_000), ("Houston", "TX", "770", 330_000), ("Killeen", "TX", "765", 255_000),
    ("Dallas", "TX", "752", 390_000), ("El Paso", "TX", "799", 245_000), ("Austin", "TX", "787", 470_000),
    ("Jacksonville", "FL", "322", 335_000), ("Tampa", "FL", "336", 395_000), ("Orlando", "FL", "328", 405_000),
    ("Pensacola", "FL", "325", 300_000), ("Atlanta", "GA", "303", 380_000), ("Savannah", "GA", "314", 320_000),
    ("Columbus", "GA", "319", 230_000), ("San Diego", "CA", "921", 865_000), ("Sacramento", "CA", "958", 520_000),
    ("Riverside", "CA", "925", 600_000), ("Colorado Springs", "CO", "809", 470_000), ("Aurora", "CO", "800", 520_000),
    ("Phoenix", "AZ", "850", 430_000), ("Tucson", "AZ", "857", 340_000), ("Las Vegas", "NV", "891", 435_000),
    ("Virginia Beach", "VA", "234", 395_000), ("Fredericksburg", "VA", "224", 470_000),
    ("Fayetteville", "NC", "283", 245_000), ("Charlotte", "NC", "282", 395_000), ("Raleigh", "NC", "276", 440_000),
    ("Columbia", "SC", "292", 275_000), ("Charleston", "SC", "294", 450_000), ("Clarksville", "TN", "370", 310_000),
    ("Nashville", "TN", "372", 470_000), ("Huntsville", "AL", "358", 310_000), ("Tacoma", "WA", "984", 520_000),
    ("Spokane", "WA", "992", 400_000), ("Oklahoma City", "OK", "731", 230_000), ("Tulsa", "OK", "741", 225_000),
    ("Albuquerque", "NM", "871", 330_000), ("Boise", "ID", "837", 470_000), ("Salt Lake City", "UT", "841", 520_000),
    ("Omaha", "NE", "681", 280_000), ("Indianapolis", "IN", "462", 255_000), ("Columbus", "OH", "432", 270_000),
    ("Detroit", "MI", "482", 180_000), ("Baltimore", "MD", "212", 300_000), ("Philadelphia", "PA", "191", 270_000),
    ("Kansas City", "MO", "641", 260_000), ("Louisville", "KY", "402", 250_000), ("Anchorage", "AK", "995", 390_000),
    ("Honolulu", "HI", "968", 850_000), ("Shreveport", "LA", "711", 200_000), ("Jackson", "MS", "392", 190_000),
]
STREETS = ["Oak", "Maple", "Cedar", "Pine", "Elm", "Willow", "Lakeview", "Sunset", "Ridge", "Meadow", "Highland",
           "Park", "Mesa", "Canyon", "Magnolia", "Pecan", "Aspen", "Hickory", "Birch", "Juniper"]
SUFFIXES = ["St", "Ave", "Dr", "Ln", "Ct", "Way", "Blvd", "Trl", "Pl", "Cir"]
TYPES = [("Single Family", 0.72), ("Townhouse", 0.14), ("Condo", 0.11), ("Multi-Family", 0.03)]
LOANS = [("FHA", 0.52), ("VA", 0.38), ("USDA", 0.07), ("Conventional", 0.03)]
# Origination years and the typical 30-yr government rate that year
VINTAGES = [(2016, 3.6), (2017, 3.9), (2018, 4.5), (2019, 3.9), (2020, 2.9), (2021, 2.8), (2022, 4.6), (2023, 6.3)]
VINTAGE_WEIGHTS = [4, 4, 5, 7, 16, 22, 10, 4]


def _pick(rng: random.Random, options):
    return rng.choices([o for o, _ in options], [w for _, w in options])[0]


class SampleSource:
    def __init__(self, cfg: dict, session=None):
        self.name = "sample"
        self.count = cfg.get("count", 400)
        self.seed = cfg.get("seed", 42)

    def fetch(self) -> Iterator[Listing]:
        rng = random.Random(self.seed)
        today = date.today()
        for _ in range(self.count):
            city, state, zip3, median = rng.choice(MARKETS)
            ptype = _pick(rng, TYPES)
            loan_type = _pick(rng, LOANS)
            year, base_rate = rng.choices(VINTAGES, VINTAGE_WEIGHTS)[0]
            rate = round(max(1.875, base_rate + rng.uniform(-0.45, 0.45)) * 8) / 8  # eighths, like real notes
            beds = rng.choices([2, 3, 4, 5, 6], [12, 40, 32, 12, 4])[0]
            if ptype == "Condo":
                beds = min(beds, 3)
            baths = max(1.0, beds - rng.choice([0, 1, 1, 1.5, 2])) if beds > 1 else 1.0
            sqft = int(rng.gauss(650 + beds * 420, 220))
            price = round(median * rng.uniform(0.6, 1.5) * (0.75 if ptype == "Condo" else 1) / 1000) * 1000
            # Original loan from purchase price at origination (lower than today's price)
            appreciation = 1 + 0.045 * (today.year - year) * rng.uniform(0.6, 1.3)
            down = 0 if loan_type in ("VA", "USDA") else (0.035 if loan_type == "FHA" else 0.1)
            original = price / appreciation * (1 - down)
            months_paid = (today.year - year) * 12 + rng.randint(-5, 5)
            n = 360
            r = rate / 100 / 12
            balance = original * ((1 + r) ** n - (1 + r) ** months_paid) / ((1 + r) ** n - 1)
            remaining_years = round((n - months_paid) / 12, 1)
            hoa = round(rng.uniform(150, 450)) if ptype in ("Condo", "Townhouse") else (
                round(rng.uniform(20, 90)) if rng.random() < 0.3 else None)
            pi = monthly_payment(balance, rate, remaining_years)
            listed = today - timedelta(days=rng.randint(0, 90))
            address = f"{rng.randint(100, 9999)} {rng.choice(STREETS)} {rng.choice(SUFFIXES)}"
            desc = (
                f"{beds} bed / {baths:g} bath {ptype.lower()} in {city}. Assumable {loan_type} loan at {rate:.3f}% "
                f"with approx. ${balance:,.0f} remaining balance (orig. {year}). "
                + ("Non-veterans may assume; seller's entitlement stays with the loan unless a veteran substitutes. "
                   if loan_type == "VA" else "")
                + rng.choice(["Updated kitchen.", "Large backyard.", "Near schools and shopping.", "New roof 2024.",
                              "Open floor plan.", "Corner lot.", "Quiet cul-de-sac.", "Close to base.", "Move-in ready."])
            )
            yield Listing(
                source="sample", url="", address=address, city=city, state=state,
                zip=f"{zip3}{rng.randint(0, 99):02d}", price=float(price), beds=float(beds), baths=float(baths),
                sqft=sqft, year_built=rng.randint(1965, year), property_type=ptype, loan_type=loan_type,
                interest_rate=rate, loan_balance=round(balance, -2), remaining_term_years=remaining_years,
                monthly_pi=round(pi, 2), hoa_monthly=hoa, description=desc, listed_date=listed.isoformat(),
            ).finalize()
