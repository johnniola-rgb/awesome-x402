# Assumable Mortgage Finder

A scraper that collects U.S. home listings with **assumable mortgages** (mostly FHA, VA and USDA loans), plus a
static dashboard for searching them by state, loan type, rate, cash needed and more.

```
assumable-mortgages/
├── scraper/              Python scraper (requests + BeautifulSoup)
│   ├── extract.py        pulls rate / loan type / balance out of listing remarks
│   ├── http.py           polite client: robots.txt, per-host delay, retries
│   └── sources/          html (selector-driven), csv (MLS/spreadsheet exports), sample (demo data)
├── dashboard/            no-build HTML/CSS/JS dashboard
│   └── data/listings.json
├── sources.example.json
└── tests/
```

## Quick start

```bash
cd assumable-mortgages
pip install -r requirements.txt

python -m scraper sample                 # demo data (already committed)
cd dashboard && python -m http.server 8000
# open http://localhost:8000
```

## Getting real listings

There's no free, open feed of assumable listings, so the scraper is built to plug into the sources you have
access to. Every source writes to the same `dashboard/data/listings.json`.

| Source | How |
| --- | --- |
| **MLS / agent search export, or a spreadsheet** | `python -m scraper import-csv export.csv --name my-mls`. Column names are matched loosely (`List Price`, `Public Remarks`, `Bedrooms Total`…). Rows are kept if the remarks mention an assumable loan or the loan type is FHA/VA/USDA. |
| **A listing website you're allowed to scrape** (brokerage site, local MLS public search, builder site) | Copy `sources.example.json` to `sources.json`, describe the page with CSS selectors, then `python -m scraper run`. A good start URL is the site's keyword search for "assumable". |
| **Combine several** | Add multiple entries to `sources.json`, or pass `--merge` to add to the existing file instead of replacing it. Listings with the same address are de-duplicated. |

### Checked in October 2026

- **Roam** (withroam.com) shut down its listing search in August 2026.
- **Assumable.io** and **AssumeList** keep listing data behind a paid account or an authenticated API. Use their
  own export if your plan has one (then `import-csv`). Don't scrape them.
- **Zillow, Redfin and Realtor.com** forbid scraping in their terms. Their keyword search for "assumable" is still
  the quickest way to find listings by hand. Agents put assumable loans in the remarks, and the CSV importer
  reads those remarks.

The scraper checks `robots.txt` and waits 3 seconds between requests to the same host (`--delay`). Set the
`USER_AGENT` environment variable to identify yourself. Only scrape sites whose terms allow it.

### Selector config

```jsonc
{
  "name": "example-brokerage",
  "type": "html",
  "start_urls": ["https://example.com/search?keywords=assumable"],
  "item_selector": "div.listing-card",     // one element per listing
  "next_selector": "a[rel=next]",          // pagination link (optional)
  "max_pages": 5,
  "follow_detail": true,                   // open each listing page to read the full remarks
  "detail_description": "section.remarks",
  "fields": {                              // CSS selector, or "selector@attr" for an attribute
    "url": "a.card-link@href",
    "address": ".address-line1",
    "city_state_zip": ".address-line2",    // "Phoenix, AZ 85001"
    "price": ".price", "beds": ".beds", "baths": ".baths", "sqft": ".sqft",
    "description": ".remarks"
    // also: state, zip, city, loan_type, interest_rate, loan_balance, monthly_pi,
    //       remaining_term_years, hoa_monthly, property_type, year_built, listed_date
  }
}
```

Any loan field you don't map is parsed from the listing text. For example, "Assumable VA loan at 2.375%, ~$310k
balance" fills in the loan type, rate and balance.

## Dashboard

- **Search** across address, city, ZIP, state and remarks, plus a **state selector** that shows listing counts.
- **Loan filters:** loan type (FHA / VA / USDA / Conventional), maximum interest rate, minimum years left on the loan.
- **Cost filters:** price range, maximum *cash to assume* (price minus loan balance, i.e. the equity gap),
  maximum monthly payment.
- **Home filters:** beds, baths, property type, how recently it was listed, and saved homes only (♥).
- **Your numbers:** today's 30-year rate, the cash you have, and an optional second loan to cover the rest of the
  gap. Each listing shows the estimated monthly savings from assuming the loan versus taking a new loan with the
  same cash down. If you turn off gap financing, homes you can't afford to assume are hidden.
- Sort by savings, rate, cash needed, payment, price or newest. Switch between card and table views, export the
  results to CSV, and share a link (filters are saved in the URL).
- The detail view compares assuming the loan with a new loan, and shows the VA, FHA and USDA assumption rules.

If you open `index.html` straight from disk, the browser blocks the data fetch and the page shows a file picker for
loading `listings.json`.

## Tests

```bash
python -m unittest discover -s tests -t .
```

## Caveats

Rates and balances parsed from listing text are the agent's claims. They can be stale or wrong. Confirm them with
the seller's loan servicer. Payments shown exclude taxes, insurance and assumption fees.
