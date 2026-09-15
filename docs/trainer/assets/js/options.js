/* options.js — options EDUCATION only.
   This trainer simulates stock trades exclusively. Nothing here is an options simulator,
   an options recommendation, or a suggestion to trade options. Options can lose 100% of
   their value, and some strategies carry unlimited risk. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};

  TT.options = {
    scope: 'This trainer does not simulate options trading. Options pricing depends on implied volatility, time decay and dividends — variables that cannot be reconstructed honestly from daily OHLC bars, and a fake options simulator teaches worse habits than none at all. What follows is the vocabulary and the decision framework, so that if you ever look at an options chain you understand what you are reading.',

    terms: [
      { t: 'Call option', d: 'A contract giving the buyer the RIGHT (not the obligation) to buy 100 shares at a set price before expiration. Buyers want the stock to rise.' },
      { t: 'Put option', d: 'The right to SELL 100 shares at a set price before expiration. Buyers want the stock to fall (or want insurance on shares they own).' },
      { t: 'Strike price', d: 'The price at which the option can be exercised. Every contract is defined by its underlying, strike and expiration.' },
      { t: 'Expiration', d: 'The date the contract dies. US equity options usually expire on Fridays; heavily traded names also have Monday/Wednesday expiries, and index products have daily ones (0DTE).' },
      { t: 'Premium', d: 'The price you pay (or collect) per share of the contract. One contract = 100 shares, so a $1.20 premium costs $120 plus fees.' },
      { t: 'Multiplier', d: 'Standard US equity options control 100 shares. A quoted price of $2.50 means $250 per contract. Forgetting this is the most common beginner arithmetic error.' },
      { t: 'Intrinsic value', d: 'The part of the premium that is real right now: how far in-the-money the option is. A $50 call with the stock at $54 has $4 of intrinsic value.' },
      { t: 'Extrinsic value (time value)', d: 'Everything above intrinsic value — what you pay for time and uncertainty. It decays to zero at expiration, always.' },
      { t: 'In the money (ITM)', d: 'A call whose strike is below the stock price, or a put whose strike is above it. Has intrinsic value.' },
      { t: 'At the money (ATM)', d: 'Strike roughly equal to the stock price. Maximum extrinsic value and maximum time decay.' },
      { t: 'Out of the money (OTM)', d: 'No intrinsic value — pure time value. Cheap, tempting, and expires worthless most of the time.' },
      { t: 'Break-even', d: 'For a long call: strike + premium paid. For a long put: strike − premium. The stock must clear this at expiration for the trade to profit, which is why "the stock went up" and "my call made money" are not the same statement.' },
      { t: 'Open interest', d: 'Contracts currently outstanding at that strike. Low open interest means poor liquidity and wide spreads — you may not be able to exit at a fair price.' },
      { t: 'Bid-ask spread', d: 'The gap between what buyers bid and sellers ask. On illiquid options this can be 10-20% of the premium — an instant loss the moment you enter.' },
      { t: 'Implied volatility (IV)', d: 'The market\'s forecast of future movement, embedded in the option price. High IV = expensive options. IV is what you are really trading when you buy or sell premium.' },
      { t: 'IV rank / IV percentile', d: 'Where current IV sits relative to its own past year. Buying options when IV rank is high means you need a big move just to overcome the inflated price you paid.' },
      { t: 'IV crush', d: 'The collapse in implied volatility immediately after a known event (earnings, FDA decision). Options can lose value even when the stock moves your way. This is the classic way beginners lose money on "correct" earnings calls.' },
      { t: 'Delta', d: 'Approximate change in option price per $1 move in the stock; also a rough proxy for the probability of finishing in the money. A 0.30 delta call moves about $0.30 per $1 and has roughly a 30% chance of expiring ITM.' },
      { t: 'Gamma', d: 'How fast delta changes. High near the money and near expiration — it is why short-dated options behave so violently.' },
      { t: 'Theta', d: 'Daily time decay. A theta of −0.05 means the option loses about $5 per contract per day, all else equal. Theta accelerates into expiration.' },
      { t: 'Vega', d: 'Sensitivity to a 1-point change in implied volatility. Long options are long vega: you profit if IV rises, lose if it falls.' },
      { t: 'Rho', d: 'Sensitivity to interest rates. Mostly ignorable for short-dated retail trades.' },
      { t: 'Assignment', d: 'When a short option holder is required to fulfil the contract — deliver or buy 100 shares per contract. Can happen early on American-style options, especially around dividends.' },
      { t: 'Exercise', d: 'Using the right the option grants. Most retail traders close the contract for cash rather than exercise, because exercising throws away remaining extrinsic value.' },
      { t: 'Covered call', d: 'Selling a call against 100 shares you own. Collects premium, caps your upside, does nothing about your downside.' },
      { t: 'Cash-secured put', d: 'Selling a put while holding enough cash to buy the shares if assigned. You are paid to agree to buy lower — but you must want to own the stock at that price.' },
      { t: 'Vertical spread', d: 'Buying one option and selling another at a different strike, same expiration. Caps both profit and loss and reduces the cost of being long premium.' },
      { t: 'Debit vs credit spread', d: 'A debit spread costs money up front and profits from movement. A credit spread pays you up front and profits from time passing or movement not happening.' },
      { t: 'Naked / uncovered short option', d: 'Selling an option without the stock or a hedging option behind it. A short call has theoretically unlimited loss. This is not a beginner strategy under any circumstances.' },
      { t: '0DTE', d: 'Zero days to expiration — options expiring the same day. Extreme gamma, extreme theta, effectively a leveraged lottery ticket. Enormous volume; enormous losses.' },
      { t: 'Pin risk', d: 'Uncertainty about assignment when the stock closes almost exactly at the strike on expiration day.' },
      { t: 'Liquidity tiers', d: 'Index ETFs and mega-caps have penny-wide options markets. Small caps often do not. Trade the liquid ones or accept that the spread is your first loss.' }
    ],

    entrySteps: [
      { h: '1. Start with the stock thesis, not the contract',
        p: 'An option is a leveraged bet on three things at once: direction, magnitude and TIMING. If you cannot state "I expect XYZ to move from $100 to at least $108 within three weeks because of [structure/catalyst]", you do not yet have an options trade. Everything below is downstream of that sentence.' },
      { h: '2. Check what is scheduled',
        p: 'Earnings, FDA dates, investor days, macro prints. Options already price known events in — that is exactly why IV is elevated beforehand and collapses afterwards. Buying premium into a known event means paying for the move before it happens.' },
      { h: '3. Check IV rank BEFORE choosing anything',
        p: 'High IV rank (say above 50) means options are expensive relative to their own history; buyers are paying up and sellers are being paid well. Low IV rank favours buying premium. Getting direction right and volatility wrong is the classic way to lose money on a correct call.' },
      { h: '4. Choose the expiration from your thesis timeline',
        p: 'A common guideline is to buy roughly twice the time you think you need, so that being early is survivable. Short-dated contracts decay fastest: the last two weeks of an option\'s life is where most of the theta damage happens. 0DTE is not a shortcut; it is the most punishing decay profile that exists.' },
      { h: '5. Choose the strike using delta',
        p: 'Delta approximates the probability of finishing in the money. Roughly: 0.70+ delta behaves much like owning stock with less capital (mostly intrinsic value, less decay); 0.50 delta is the balanced, maximum-extrinsic choice; 0.20-0.30 delta is cheap and usually expires worthless. Beginners buy far OTM contracts because the premium is small, which is precisely why those contracts are small — the market is pricing a low probability.' },
      { h: '6. Demand liquidity',
        p: 'Look for tight bid-ask spreads (ideally under ~5% of the premium), meaningful open interest and real daily volume. Always use limit orders, and start at the mid-price. An illiquid option is a position you can enter but not exit.' },
      { h: '7. Compute the break-even and the real risk',
        p: 'Call break-even = strike + premium. Ask yourself whether the stock reaching that price within the chosen timeframe is genuinely likely given the chart and the ATR. Then accept the honest downside: a long option can and frequently does go to zero, so the position size must assume total loss.' },
      { h: '8. Define the exit before entry',
        p: 'Price-based (stock invalidates the thesis), premium-based (a 50% loss of premium), or time-based (exit with 21 days left to avoid the worst decay). Without an exit rule, decay makes the decision for you — always at the worst moment.' },
      { h: '9. Size as if it can go to zero',
        p: 'A long option is not "cheap exposure" — it is a total-loss-capable instrument. Risking 1-2% of an account per trade means the entire premium is that 1-2%, not the notional value of 100 shares.' }
    ],

    mistakes: [
      'Buying far out-of-the-money weeklies because they are "cheap". Cheap is the market telling you it is unlikely.',
      'Buying calls right before earnings and being surprised when IV crush eats the gain from a correct direction.',
      'Trading options on illiquid stocks where the spread alone is 15% of the premium.',
      'Ignoring theta on a thesis that needs two weeks to play out with a contract that expires Friday.',
      'Selling naked calls without understanding that the loss is theoretically unlimited.',
      'Thinking of contracts as "shares" — one contract is 100 shares of exposure, and position sizing must reflect that.',
      'Holding to expiration hoping for a miracle instead of taking the planned exit.'
    ],

    whyNotSimulated: [
      'Honest options simulation needs a full options chain with per-strike implied volatility, bid-ask spreads and interest rates at every historical timestamp. Those are not derivable from OHLC bars.',
      'A simulator that priced options with a naive model would teach you that decay and IV crush are mild. They are not — and that false lesson is more expensive than not practising at all.',
      'The skills that carry over to options — reading structure, defining risk, sizing, exits — are exactly what the stock simulator here trains. Build those first.',
      'If you later want options practice, use a broker paper-trading account with a real, live options chain, and read the OCC\'s "Characteristics and Risks of Standardized Options" disclosure first (your broker must provide it).'
    ]
  };
})(window);
