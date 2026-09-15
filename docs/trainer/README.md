# Trading Trainer — day & swing trading simulator

A self-contained, dependency-free browser app for **practising** day and swing trading on
**real historical stock data** with **imaginary money**, and getting specific, automated
feedback on entries, exits, stops, targets and position sizing.

> **Training purposes only.** No real money, no live data, no brokerage services, and
> nothing in it is investment advice. See [Legal](#legal) below and the in-app Legal tab.

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000 --directory docs
# → http://localhost:8000/trainer/
```

When deployed with this repo's GitHub Pages workflow it is served at `/awesome-x402/trainer/`.

---

## What it does

| Area | What you get |
|---|---|
| **Paper trading** | Starting balance $2,000 (changeable in Settings), market/limit/stop entries, bracket stop-loss and take-profit, partial exits, short selling, live P&L and equity |
| **Bar-by-bar replay** | Real OHLCV bars revealed one at a time — no future bars are ever used in any calculation. Play/pause, speed control, random blind sessions |
| **Strategy playbooks** | 12 strategies (ORB, VWAP reversion, momentum pullback, break & retest, gap & go, failed-breakout reversal, flags, swing EMA pullback, base breakout, range fade, MA crossover, mean reversion) each with rules **and machine-checkable entry criteria** |
| **Pre-trade coach** | Before you submit: risk % of account, reward:risk with its break-even win rate, stop vs ATR, stop vs structure, levels in the way, and every rule of the selected playbook |
| **Post-trade review** | Letter grade plus a breakdown of entry quality, stop placement, target/exit, and sizing — using MAE/MFE, R multiples, give-back detection, stopped-then-ran detection, and what price did *after* you exited |
| **Candle Classroom** | 34 patterns with drawn examples, the psychology behind each, how they are traded, what invalidates them — plus live detection on real charts and a quiz |
| **30 tools** | The tools traders actually use, each with how to read it, typical settings, what it is good for, and **how it fails**. 22 of them render on the simulator chart |
| **Structure Lab** | Swing points, BOS/CHoCH, fair value gaps, order blocks, liquidity sweeps, S/R clusters and volume profile detected automatically on real charts, one concept at a time |
| **Options 101** | Terminology, the Greeks, IV rank and IV crush, and a 9-step framework for how an options entry is selected. Education only — options are deliberately **not** simulated (see below) |
| **Learn** | 13 lessons: day vs swing, the honest odds, market mechanics, account rules (incl. the 2026 PDT rule change), risk math, market structure, the trading day hour by hour, psychology, journaling, routine, mistakes, glossary |
| **Journal** | Every closed trade stored locally with R, MAE/MFE, grade and your own note; expectancy and profit factor by strategy; JSON/CSV export |

## Data

Static historical OHLCV captured **2026-09-15** from a third-party market data provider,
split-adjusted, regular session only (09:30–16:00 ET):

- `data/daily.js` — 10 symbols (SPY, QQQ, AAPL, NVDA, TSLA, AMD, MSFT, META, AMZN, COIN), ~3 years of daily bars
- `data/intraday-5m.js` — 8 symbols × 24 sessions of 5-minute bars
- `data/intraday-1m.js` — NVDA and TSLA × 4 sessions of 1-minute bars

Intraday files load on demand. **This is not live data and must never be used for a real
trading decision.** Day-trading sessions include two prior sessions of context so that
prior-day levels, gaps and VWAP behave correctly.

## How fills are modelled

Stated plainly so you know exactly what is idealised (also listed in the app's Settings tab):

- Market orders fill at the current bar's close plus slippage (default 1 bp).
- Limit orders fill if the bar's range reaches the price; stop orders fill at the trigger plus slippage, or at the open if the bar gapped through.
- **When a stop and a target are both inside one bar, the trainer assumes the stop filled first** — the conservative assumption, since bar data cannot say which came first.
- Not modelled: margin, leverage, borrow fees and locates, partial fills, queue position, halts, dividends, corporate actions, taxes, and the psychological weight of real money.
- Day-trading mode force-closes at the session end, because that is the discipline being taught.

## Why options are not simulated

Honest options pricing needs the full chain — per-strike implied volatility, spreads and
rates at every historical timestamp — which cannot be reconstructed from OHLC bars. A
simulator using a naive model would teach that theta decay and IV crush are mild. They are
not, and that false lesson costs more than not practising at all. The Options 101 tab
therefore teaches the vocabulary and the entry framework, and points you to a broker paper
account with a live chain for the rest.

## Architecture

No build step, no dependencies, no network calls at runtime. Plain ES5-compatible scripts
with a `TT` namespace, canvas chart rendering, and `localStorage` for settings and journal.

```
index.html
assets/css/app.css
assets/js/
  core.js         utilities, formatting, local persistence
  indicators.js   ~30 indicators; every series is index-aligned and never peeks ahead
  structure.js    swings, trend, BOS/CHoCH, FVG, order blocks, sweeps, S/R, ranges
  chart.js        dependency-free canvas candlestick chart with overlays and annotations
  sim.js          the trading engine: orders, fills, positions, R multiples, MAE/MFE, stats
  strategies.js   12 playbooks with machine-checkable rules
  review.js       pre-trade checks, post-trade grading, session review
  patterns.js     34 candle patterns with detectors and SVG rendering
  tools.js        the 30-tool reference
  options.js      options education content
  learn.js        the curriculum
  legal.js        disclaimers and terms
  data.js         dataset construction and lazy loading
  app.js          state, navigation, chart wiring, replay
  app-trade.js    order ticket, coach UI, positions, blotter, review modal
  app-views.js    classroom, tools, strategies, lab, options, learn, journal, settings, legal
data/             static historical market data
```

Everything that grades a trade runs only on bars that existed at that moment. Swing points
are confirmed with a lookforward window, so a swing is only "known" some bars after it
prints — exactly as in live trading.

## Legal

Simulated trading with imaginary money on historical data, for education only. Not
investment, financial, legal or tax advice; not a recommendation or solicitation; not a
broker-dealer or investment adviser. Trading real securities involves substantial risk of
loss, and the majority of active day traders lose money. Simulated and hypothetical results
have inherent limitations and do not reflect real execution, costs, liquidity or
psychological pressure. You are solely responsible for your own trading decisions and for
any losses you incur. The full terms, risk disclosure and limitation of liability are in
the app's **Legal** tab, which every user must acknowledge before the trainer opens.

Regulatory summaries (FINRA day-trading margin rules, the 2026 replacement of the pattern
day trader designation, T+1 settlement, good faith violations) were believed accurate as of
September 2026 and are simplified for teaching. Verify current rules with your broker and
with FINRA/SEC primary sources. Anyone deploying this publicly should have counsel review
the terms for their jurisdiction and add their own entity details and governing law.
