import csv
import tempfile
import unittest

from scraper import extract
from scraper.models import Listing, monthly_payment
from scraper.sources.csv_import import CsvSource
from scraper.sources.html_config import HtmlConfigSource


class ExtractTests(unittest.TestCase):
    def test_rate_variants(self):
        self.assertEqual(extract.extract_rate("Assumable VA loan at 2.375%!"), 2.375)
        self.assertEqual(extract.extract_rate("2.75% assumable FHA mortgage"), 2.75)
        self.assertEqual(extract.extract_rate("interest rate: 3.1%"), 3.1)
        self.assertIsNone(extract.extract_rate("Seller offering 25% off closing"))

    def test_loan_type(self):
        self.assertEqual(extract.extract_loan_type("Assumable FHA loan"), "FHA")
        self.assertEqual(extract.extract_loan_type("VA mortgage is assumable"), "VA")
        self.assertEqual(extract.extract_loan_type("assumable usda"), "USDA")
        self.assertEqual(extract.extract_loan_type("great kitchen"), "Unknown")

    def test_balance(self):
        self.assertEqual(extract.extract_balance("remaining balance of $312,500"), 312_500)
        self.assertEqual(extract.extract_balance("approx $280k balance"), 280_000)
        self.assertIsNone(extract.extract_balance("HOA $250"))

    def test_assumable_flags(self):
        self.assertTrue(extract.is_assumable("Buyer can assume the loan"))
        self.assertFalse(extract.is_assumable("Loan is not assumable"))
        self.assertFalse(extract.is_assumable("Nice house"))

    def test_city_state_zip(self):
        self.assertEqual(extract.parse_city_state_zip("San Antonio, TX 78201"), ("San Antonio", "TX", "78201"))
        self.assertEqual(extract.parse_city_state_zip("Boise, Idaho"), ("Boise", "ID", ""))


class ModelTests(unittest.TestCase):
    def test_payment(self):
        self.assertAlmostEqual(monthly_payment(300_000, 3.0, 30), 1264.81, places=2)

    def test_finalize_derives_gap_and_payment(self):
        listing = Listing(source="t", url="", address="1 A St", state="TX", price=400_000,
                          loan_balance=300_000, interest_rate=3.0, remaining_term_years=30).finalize()
        self.assertEqual(listing.equity_gap, 100_000)
        self.assertEqual(listing.equity_gap_pct, 25.0)
        self.assertAlmostEqual(listing.monthly_pi, 1264.81, places=2)
        self.assertTrue(listing.id)


class SourceTests(unittest.TestCase):
    def test_csv_import_filters_and_maps(self):
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["Address", "City", "State", "List Price", "Bedrooms", "Public Remarks"])
            writer.writerow(["1 Oak St", "Tampa", "Florida", "$350,000", "3", "Assumable VA loan at 2.5%, balance $260k"])
            writer.writerow(["2 Elm St", "Tampa", "FL", "$300,000", "2", "Conventional financing only"])
        rows = list(CsvSource({"path": fh.name}).fetch())
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row.state, row.loan_type, row.interest_rate), ("FL", "VA", 2.5))
        self.assertEqual((row.price, row.loan_balance, row.equity_gap), (350_000, 260_000, 90_000))

    def test_html_source_parses_cards(self):
        html = """
        <div class=card><a class=l href="/h/1">x</a><span class=a>9 Pine Dr</span>
          <span class=c>Phoenix, AZ 85001</span><span class=p>$410,000</span>
          <p class=r>Assumable FHA mortgage at 2.875% interest rate</p></div>
        <div class=card><a class=l href="/h/2">x</a><span class=a>10 Pine Dr</span>
          <span class=c>Phoenix, AZ 85001</span><span class=p>$390,000</span><p class=r>Pool</p></div>
        """

        class FakeSession:
            def get(self, url):
                return type("R", (), {"text": html})()

        cfg = {"name": "t", "start_urls": ["https://x.test/s"], "item_selector": "div.card", "max_pages": 1,
               "fields": {"url": "a.l@href", "address": ".a", "city_state_zip": ".c", "price": ".p",
                          "description": ".r"}}
        rows = list(HtmlConfigSource(cfg, FakeSession()).fetch())
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0].url, rows[0].state, rows[0].loan_type, rows[0].interest_rate),
                         ("https://x.test/h/1", "AZ", "FHA", 2.875))


if __name__ == "__main__":
    unittest.main()
