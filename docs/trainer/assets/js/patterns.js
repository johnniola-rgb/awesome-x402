/* patterns.js — Candle Classroom.
   Every pattern carries: a drawn example, what it means, the psychology behind it,
   how it is traded, what invalidates it, and (where it can be defined objectively)
   a detector that runs on the real bars in the simulator. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};

  /* --- detector helpers (all operate on real OHLC bars) --- */
  function body(b) { return Math.abs(b.c - b.o); }
  function range(b) { return Math.max(1e-9, b.h - b.l); }
  function upper(b) { return b.h - Math.max(b.o, b.c); }
  function lower(b) { return Math.min(b.o, b.c) - b.l; }
  function bull(b) { return b.c > b.o; }
  function bear(b) { return b.c < b.o; }
  function bodyPct(b) { return body(b) / range(b); }
  function trendBefore(bars, i, n) {
    n = n || 5;
    if (i < n) return 0;
    var a = bars[i - n].c, z = bars[i - 1].c;
    var atr = TT.ind.atr(bars.slice(0, i + 1), 14)[i] || range(bars[i]);
    if (!atr) return 0;
    var mv = (z - a) / atr;
    return mv > 1 ? 1 : mv < -1 ? -1 : 0;
  }

  var P = [
    /* ---------------- single-candle ---------------- */
    {
      id: 'hammer', name: 'Hammer', group: 'Single candle', bias: 'Bullish reversal', reliability: 'Moderate — high with confirmation',
      art: [{ o: 62, h: 70, l: 20, c: 66 }],
      what: 'A small body at the top of the range with a lower wick at least twice the body. Appears after a decline.',
      psychology: 'Sellers pushed price down hard during the bar, then buyers took it all back before the close. The low was rejected — that rejection is the whole signal, and it is only meaningful after a real downmove.',
      trade: 'Enter on a break of the hammer\'s high, or on the close of the next bar if it closes higher. Stop goes below the hammer\'s low, which is now a defined rejection point.',
      confirm: 'Next bar closes above the hammer body. Bonus if the hammer prints at a known support level, VWAP, or a prior swing low.',
      invalid: 'A close below the hammer\'s low. The rejection failed and sellers are back in control.',
      context: 'A hammer in the middle of a range is noise. A hammer at the third test of support after a five-bar slide is a signal. Context is the difference.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.35 && lower(b) > body(b) * 2 && upper(b) < body(b) * 0.8 && trendBefore(bars, i) <= 0;
      }
    },
    {
      id: 'shooting-star', name: 'Shooting Star', group: 'Single candle', bias: 'Bearish reversal', reliability: 'Moderate — high with confirmation',
      art: [{ o: 38, h: 82, l: 30, c: 34 }],
      what: 'Small body at the bottom of the range with a long upper wick, appearing after an advance.',
      psychology: 'Buyers drove price to a new high and were completely rejected by the close. Everyone who bought that spike is now underwater and becomes supply on the way back up.',
      trade: 'Short a break of the star\'s low; stop above its high. The wick high is your invalidation and it is usually obvious to everyone else too.',
      confirm: 'A lower close on the next bar, ideally with volume expansion.',
      invalid: 'A close above the wick high.',
      context: 'Most powerful at a prior resistance level, a round number, or after an extended run with no pullback.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.35 && upper(b) > body(b) * 2 && lower(b) < body(b) * 0.8 && trendBefore(bars, i) >= 0;
      }
    },
    {
      id: 'inverted-hammer', name: 'Inverted Hammer', group: 'Single candle', bias: 'Bullish reversal', reliability: 'Low alone — needs confirmation',
      art: [{ o: 34, h: 82, l: 28, c: 40 }],
      what: 'Same shape as a shooting star but appearing after a decline.',
      psychology: 'Buyers made a serious attempt higher and failed — but the fact that the attempt happened at all after a selloff shows demand is appearing. It is a warning shot, not a reversal by itself.',
      trade: 'Wait for a higher close before acting. Enter above the next bar\'s high, stop under the inverted hammer\'s low.',
      confirm: 'Absolutely required. Unconfirmed inverted hammers fail frequently.',
      invalid: 'New lows below the candle.',
      context: 'Best where a downtrend is meeting long-term support or a value area low.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.35 && upper(b) > body(b) * 2 && lower(b) < body(b) * 0.8 && trendBefore(bars, i) < 0;
      }
    },
    {
      id: 'hanging-man', name: 'Hanging Man', group: 'Single candle', bias: 'Bearish reversal', reliability: 'Low-moderate',
      art: [{ o: 62, h: 70, l: 20, c: 66 }],
      what: 'Hammer shape appearing after an ADVANCE rather than a decline.',
      psychology: 'Even in an uptrend, sellers were able to drive price sharply lower intrabar. Buyers rescued it, but the appearance of that much supply near the highs is a change in character.',
      trade: 'Only on confirmation — a lower close next bar. Stop above the hanging man\'s high.',
      confirm: 'Essential; the shape is identical to a hammer and only location distinguishes it.',
      invalid: 'Continued higher closes.',
      context: 'A textbook example of why the SAME candle means opposite things depending on what came before it.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.35 && lower(b) > body(b) * 2 && upper(b) < body(b) * 0.8 && trendBefore(bars, i) > 0;
      }
    },
    {
      id: 'doji', name: 'Doji', group: 'Single candle', bias: 'Indecision', reliability: 'Context-dependent',
      art: [{ o: 50, h: 76, l: 24, c: 50 }],
      what: 'Open and close are essentially equal. The market went nowhere despite moving around.',
      psychology: 'Perfect balance between buyers and sellers. After a long directional run, balance means the dominant side has lost its grip.',
      trade: 'Do not trade the doji itself — trade the break of its range. A close above the doji high in an uptrend is continuation; below the low is a reversal warning.',
      confirm: 'The next bar\'s direction is the signal.',
      invalid: 'N/A — it is a state, not a directional pattern.',
      context: 'A doji inside a tight range is meaningless. A doji after eight strong up-bars into resistance is a genuine alert.',
      detect: function (bars, i) { return bodyPct(bars[i]) < 0.08; }
    },
    {
      id: 'dragonfly', name: 'Dragonfly Doji', group: 'Single candle', bias: 'Bullish reversal', reliability: 'Moderate',
      art: [{ o: 72, h: 74, l: 20, c: 72 }],
      what: 'Open, high and close all cluster at the top with a long lower wick.',
      psychology: 'A full round trip: sellers took total control intrabar and lost all of it. Complete rejection of lower prices.',
      trade: 'Buy a break of the high, stop under the wick.',
      confirm: 'Higher close the next bar.',
      invalid: 'A close below the wick low.',
      context: 'Strongest at support with a volume spike on the wick.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.1 && lower(b) > range(b) * 0.6 && upper(b) < range(b) * 0.1;
      }
    },
    {
      id: 'gravestone', name: 'Gravestone Doji', group: 'Single candle', bias: 'Bearish reversal', reliability: 'Moderate',
      art: [{ o: 26, h: 80, l: 24, c: 26 }],
      what: 'Open, low and close cluster at the bottom with a long upper wick.',
      psychology: 'Buyers took price up and gave every cent back. Total rejection of higher prices — often the exact signature of a liquidity sweep above a known high.',
      trade: 'Short a break of the low with a stop above the wick.',
      confirm: 'Lower close next bar.',
      invalid: 'A close above the wick high.',
      context: 'Watch for this at prior day highs and at obvious round numbers.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.1 && upper(b) > range(b) * 0.6 && lower(b) < range(b) * 0.1;
      }
    },
    {
      id: 'long-legged', name: 'Long-Legged Doji', group: 'Single candle', bias: 'Indecision / volatility', reliability: 'Low alone',
      art: [{ o: 50, h: 88, l: 12, c: 50 }],
      what: 'Long wicks both directions, tiny body — a wide, violent, indecisive bar.',
      psychology: 'Both sides fought hard and neither won. Volatility expanded without resolution, which frequently precedes a genuine directional move.',
      trade: 'Trade the break of the bar\'s range with a stop on the other side. Often used as an inside-bar-style trigger.',
      confirm: 'The resolution bar.',
      invalid: 'A second long-legged doji — the market is still undecided; stand aside.',
      context: 'Common around news events and at the open.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.12 && upper(b) > range(b) * 0.3 && lower(b) > range(b) * 0.3;
      }
    },
    {
      id: 'marubozu-bull', name: 'Bullish Marubozu', group: 'Single candle', bias: 'Bullish continuation', reliability: 'Moderate-high',
      art: [{ o: 22, h: 80, l: 20, c: 78 }],
      what: 'A full-bodied up candle with virtually no wicks — opens at the low, closes at the high.',
      psychology: 'One-way demand for the entire bar. No one who wanted in got a better price. This is what "displacement" looks like in smart-money terms.',
      trade: 'Continuation: buy pullbacks into the marubozu body, treating it as an order block. The midpoint of the candle is the classic entry.',
      confirm: 'Follow-through the next bar; a failure to continue is itself informative.',
      invalid: 'A close back below the marubozu open.',
      context: 'A marubozu that breaks a key level is the highest-quality break you can get.',
      detect: function (bars, i) { var b = bars[i]; return bull(b) && bodyPct(b) > 0.9; }
    },
    {
      id: 'marubozu-bear', name: 'Bearish Marubozu', group: 'Single candle', bias: 'Bearish continuation', reliability: 'Moderate-high',
      art: [{ o: 80, h: 82, l: 20, c: 22 }],
      what: 'Full-bodied down candle with no meaningful wicks.',
      psychology: 'Relentless supply for the whole bar. Every buyer in that range is instantly offside.',
      trade: 'Sell rallies into the candle body; stop above the candle high.',
      confirm: 'Continued weakness.',
      invalid: 'A close above the candle open.',
      context: 'Marubozu candles through support are how real breakdowns start.',
      detect: function (bars, i) { var b = bars[i]; return bear(b) && bodyPct(b) > 0.9; }
    },
    {
      id: 'spinning-top', name: 'Spinning Top', group: 'Single candle', bias: 'Indecision', reliability: 'Low',
      art: [{ o: 45, h: 78, l: 22, c: 55 }],
      what: 'Small body with visible wicks on both sides.',
      psychology: 'Neither side committed. A cluster of spinning tops is the definition of chop — and the definition of a market to leave alone.',
      trade: 'Mostly a filter, not a trade. Several in a row tells you to stop taking momentum setups.',
      confirm: 'N/A',
      invalid: 'N/A',
      context: 'Useful as a warning that ATR is about to contract.',
      detect: function (bars, i) {
        var b = bars[i];
        return bodyPct(b) < 0.3 && upper(b) > body(b) * 0.5 && lower(b) > body(b) * 0.5;
      }
    },
    /* ---------------- two-candle ---------------- */
    {
      id: 'bull-engulf', name: 'Bullish Engulfing', group: 'Two candle', bias: 'Bullish reversal', reliability: 'High with context',
      art: [{ o: 62, h: 66, l: 46, c: 48 }, { o: 45, h: 78, l: 42, c: 74 }],
      what: 'A down candle followed by an up candle whose body completely covers the prior body.',
      psychology: 'Everyone who sold the previous bar is underwater within one bar. The buyer was willing to take every offer through the entire prior range — that is size, not retail.',
      trade: 'Enter at the close of the engulfing bar or on a small pullback into its body. Stop below the engulfing candle\'s low.',
      confirm: 'Volume on the engulfing bar should exceed the prior bar. A higher close next bar seals it.',
      invalid: 'A close below the engulfing bar\'s low.',
      context: 'At support after a decline it is one of the most reliable candle signals. Mid-range it is noise.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return bear(p) && bull(b) && b.c > p.o && b.o < p.c && body(b) > body(p);
      }
    },
    {
      id: 'bear-engulf', name: 'Bearish Engulfing', group: 'Two candle', bias: 'Bearish reversal', reliability: 'High with context',
      art: [{ o: 40, h: 58, l: 36, c: 56 }, { o: 60, h: 64, l: 26, c: 30 }],
      what: 'An up candle fully engulfed by the next down candle\'s body.',
      psychology: 'Buyers were overwhelmed inside a single bar. A supply block just appeared where demand looked fine a moment ago.',
      trade: 'Short the close or a retest of the engulfing body; stop above the engulfing high.',
      confirm: 'Expanding volume, lower close next bar.',
      invalid: 'A close above the engulfing high.',
      context: 'Deadly at resistance or after a climactic run.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return bull(p) && bear(b) && b.c < p.o && b.o > p.c && body(b) > body(p);
      }
    },
    {
      id: 'piercing', name: 'Piercing Line', group: 'Two candle', bias: 'Bullish reversal', reliability: 'Moderate',
      art: [{ o: 70, h: 74, l: 40, c: 42 }, { o: 36, h: 66, l: 34, c: 62 }],
      what: 'A strong down candle, then an up candle that opens lower but closes back above the midpoint of the first body.',
      psychology: 'The gap down trapped sellers; buyers reclaimed more than half of the prior day\'s damage. Momentum has shifted even though the reversal is not complete.',
      trade: 'Buy above the second candle\'s high, stop under its low.',
      confirm: 'The deeper the penetration into the first body, the better. Less than 50% is not a piercing line.',
      invalid: 'A close below the first candle\'s low.',
      context: 'A weaker cousin of the bullish engulfing pattern — same idea, less conviction.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i], mid = (p.o + p.c) / 2;
        return bear(p) && bull(b) && b.o < p.c && b.c > mid && b.c < p.o;
      }
    },
    {
      id: 'dark-cloud', name: 'Dark Cloud Cover', group: 'Two candle', bias: 'Bearish reversal', reliability: 'Moderate',
      art: [{ o: 34, h: 66, l: 30, c: 62 }, { o: 70, h: 74, l: 38, c: 44 }],
      what: 'A strong up candle, then a candle that opens higher and closes below the midpoint of the prior body.',
      psychology: 'The higher open sucked in breakout buyers who were then sold into all bar. Failure right after strength is a powerful tell.',
      trade: 'Short below the second candle\'s low; stop above its high.',
      confirm: 'A follow-through down close.',
      invalid: 'A reclaim above the second candle\'s high.',
      context: 'Watch for this at highs of day and at prior resistance.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i], mid = (p.o + p.c) / 2;
        return bull(p) && bear(b) && b.o > p.c && b.c < mid && b.c > p.o;
      }
    },
    {
      id: 'bull-harami', name: 'Bullish Harami', group: 'Two candle', bias: 'Bullish reversal', reliability: 'Low-moderate',
      art: [{ o: 74, h: 78, l: 28, c: 32 }, { o: 44, h: 56, l: 40, c: 52 }],
      what: 'A large down candle followed by a small up candle contained entirely within the prior body.',
      psychology: 'Selling pressure stopped abruptly. Not a reversal yet — an exhaustion signal. The market paused, and pauses after one-way moves often precede turns.',
      trade: 'Enter on a break of the harami\'s high, stop below the mother candle\'s low (which can be far — size for it).',
      confirm: 'Required. The pattern alone has a mediocre track record.',
      invalid: 'A close below the mother candle\'s low.',
      context: 'Best combined with an oversold oscillator reading or arrival at support.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return bear(p) && bull(b) && b.o > p.c && b.c < p.o && body(b) < body(p) * 0.6;
      }
    },
    {
      id: 'bear-harami', name: 'Bearish Harami', group: 'Two candle', bias: 'Bearish reversal', reliability: 'Low-moderate',
      art: [{ o: 28, h: 76, l: 24, c: 72 }, { o: 58, h: 66, l: 50, c: 52 }],
      what: 'A large up candle followed by a small down candle inside its body.',
      psychology: 'Buying momentum stalled. A stall near highs is the first requirement of a top, though far from sufficient.',
      trade: 'Short a break of the small candle\'s low, stop above the mother candle high.',
      confirm: 'Required.',
      invalid: 'A new high close.',
      context: 'Frequently marks the start of a consolidation rather than a reversal.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return bull(p) && bear(b) && b.o < p.c && b.c > p.o && body(b) < body(p) * 0.6;
      }
    },
    {
      id: 'tweezer-bottom', name: 'Tweezer Bottom', group: 'Two candle', bias: 'Bullish reversal', reliability: 'Moderate',
      art: [{ o: 62, h: 68, l: 26, c: 38 }, { o: 40, h: 70, l: 27, c: 66 }],
      what: 'Two or more candles with matching lows.',
      psychology: 'The same price was tested twice and defended twice. Buyers are defending a specific number, which makes your invalidation obvious and cheap.',
      trade: 'Buy the second rejection; stop a few cents below the shared low.',
      confirm: 'A higher high after the second test.',
      invalid: 'Any close below the shared low — and the resulting break is often fast, because everyone had stops there.',
      context: 'Extremely common at prior day lows, session lows and round numbers.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i], tol = range(b) * 0.12;
        return Math.abs(p.l - b.l) <= tol && trendBefore(bars, i) <= 0 && bull(b);
      }
    },
    {
      id: 'tweezer-top', name: 'Tweezer Top', group: 'Two candle', bias: 'Bearish reversal', reliability: 'Moderate',
      art: [{ o: 38, h: 74, l: 32, c: 62 }, { o: 60, h: 73, l: 34, c: 38 }],
      what: 'Two or more candles with matching highs.',
      psychology: 'A ceiling defended twice. Sellers are working a specific price.',
      trade: 'Short the second rejection, stop just above the shared high.',
      confirm: 'A lower low after the second test.',
      invalid: 'A close above the shared high.',
      context: 'The double top in miniature.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i], tol = range(b) * 0.12;
        return Math.abs(p.h - b.h) <= tol && trendBefore(bars, i) >= 0 && bear(b);
      }
    },
    {
      id: 'kicker-bull', name: 'Bullish Kicker', group: 'Two candle', bias: 'Bullish reversal', reliability: 'High (rare)',
      art: [{ o: 60, h: 64, l: 34, c: 36 }, { o: 66, h: 88, l: 64, c: 86 }],
      what: 'A down candle followed by a gap-up candle that never trades back into the prior range.',
      psychology: 'Something changed overnight — usually news. The market repriced without giving anyone a chance to participate at the old price. Positions on the wrong side cannot be exited at a reasonable price.',
      trade: 'Momentum continuation. These rarely retrace immediately; buy pullbacks into the gap edge rather than waiting for a full fill.',
      confirm: 'The gap holding for the first 30-60 minutes.',
      invalid: 'A full gap fill back into the prior candle body.',
      context: 'The candle-pattern version of "Gap and Go". It is also a reminder that overnight positions carry gap risk stops cannot protect.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return bear(p) && bull(b) && b.o > p.o && b.l > p.h;
      }
    },
    {
      id: 'kicker-bear', name: 'Bearish Kicker', group: 'Two candle', bias: 'Bearish reversal', reliability: 'High (rare)',
      art: [{ o: 40, h: 66, l: 36, c: 64 }, { o: 34, h: 36, l: 12, c: 14 }],
      what: 'An up candle followed by a gap-down candle that never trades back up into it.',
      psychology: 'Bad news repriced the stock. Holders are trapped and every bounce is sold by people who want out at any price.',
      trade: 'Short rallies into the gap edge; do not expect the gap to fill quickly.',
      confirm: 'Failure to reclaim the gap in the first hour.',
      invalid: 'A full reclaim of the gap.',
      context: 'This is exactly why swing traders check the earnings calendar before holding overnight.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return bull(p) && bear(b) && b.o < p.o && b.h < p.l;
      }
    },
    {
      id: 'inside-bar', name: 'Inside Bar', group: 'Two candle', bias: 'Compression / breakout setup', reliability: 'Moderate as a trigger',
      art: [{ o: 30, h: 84, l: 16, c: 70 }, { o: 56, h: 68, l: 40, c: 46 }],
      what: 'A bar whose entire range is inside the previous bar\'s range.',
      psychology: 'Volatility contracted. The market is coiling, and coils resolve with expansion — which is why inside bars are used as entry triggers rather than as directional signals.',
      trade: 'Buy a break of the mother bar high or sell a break of its low, with the stop on the opposite side. Risk is mechanically defined and usually small.',
      confirm: 'The direction of the break, ideally with volume.',
      invalid: 'A break the other way — many traders simply reverse.',
      context: 'Multiple consecutive inside bars (a "coil") make the eventual break more explosive. NR7 (narrowest range of 7 bars) is the quantified version.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return b.h <= p.h && b.l >= p.l;
      }
    },
    {
      id: 'outside-bar', name: 'Outside Bar (Engulfing Range)', group: 'Two candle', bias: 'Volatility expansion', reliability: 'Moderate',
      art: [{ o: 48, h: 62, l: 40, c: 54 }, { o: 58, h: 84, l: 22, c: 30 }],
      what: 'A bar whose high is higher and low is lower than the previous bar — it takes out both sides.',
      psychology: 'Both sets of stops were run inside one bar. The closing location tells you who won: near the high means buyers, near the low means sellers.',
      trade: 'Trade in the direction of the close, with the stop at the opposite extreme.',
      confirm: 'Follow-through the next bar.',
      invalid: 'A close back through the middle of the outside bar.',
      context: 'A very common shape around news and at session opens.',
      detect: function (bars, i) {
        if (i < 1) return false;
        var p = bars[i - 1], b = bars[i];
        return b.h > p.h && b.l < p.l;
      }
    },
    /* ---------------- three-candle ---------------- */
    {
      id: 'morning-star', name: 'Morning Star', group: 'Three candle', bias: 'Bullish reversal', reliability: 'High',
      art: [{ o: 78, h: 82, l: 48, c: 50 }, { o: 44, h: 50, l: 38, c: 42 }, { o: 48, h: 84, l: 46, c: 80 }],
      what: 'A big down candle, a small indecisive candle (the star), then a strong up candle closing well into the first body.',
      psychology: 'Panic, then exhaustion, then aggressive accumulation. It is the complete three-act structure of a bottom compressed into three bars.',
      trade: 'Enter on the close of the third candle or on a pullback to the star\'s range. Stop below the star\'s low.',
      confirm: 'The third candle should close above the midpoint of the first candle — the deeper, the better.',
      invalid: 'A close below the star\'s low.',
      context: 'One of the highest-rated reversal patterns in the classical literature, especially on daily charts at support.',
      detect: function (bars, i) {
        if (i < 2) return false;
        var a = bars[i - 2], s = bars[i - 1], b = bars[i];
        return bear(a) && body(s) < body(a) * 0.5 && bull(b) && b.c > (a.o + a.c) / 2 && body(b) > body(s) * 1.5;
      }
    },
    {
      id: 'evening-star', name: 'Evening Star', group: 'Three candle', bias: 'Bearish reversal', reliability: 'High',
      art: [{ o: 22, h: 54, l: 18, c: 52 }, { o: 58, h: 64, l: 52, c: 56 }, { o: 52, h: 56, l: 18, c: 22 }],
      what: 'A strong up candle, a small star, then a strong down candle closing deep into the first body.',
      psychology: 'Euphoria, hesitation, then distribution. The mirror image of the morning star.',
      trade: 'Short the close of the third bar or a retest of the star; stop above the star\'s high.',
      confirm: 'Third candle closing below the midpoint of the first.',
      invalid: 'A close above the star\'s high.',
      context: 'Very reliable at the end of extended runs and at daily resistance.',
      detect: function (bars, i) {
        if (i < 2) return false;
        var a = bars[i - 2], s = bars[i - 1], b = bars[i];
        return bull(a) && body(s) < body(a) * 0.5 && bear(b) && b.c < (a.o + a.c) / 2 && body(b) > body(s) * 1.5;
      }
    },
    {
      id: 'three-soldiers', name: 'Three White Soldiers', group: 'Three candle', bias: 'Bullish continuation/reversal', reliability: 'Moderate-high',
      art: [{ o: 22, h: 42, l: 20, c: 40 }, { o: 36, h: 60, l: 34, c: 58 }, { o: 54, h: 80, l: 52, c: 78 }],
      what: 'Three consecutive strong up candles, each closing near its high and opening within the prior body.',
      psychology: 'Steady, persistent accumulation — no panic buying, no gaps, just relentless demand. Strong hands are building.',
      trade: 'Buy the first pullback rather than the third soldier itself, which is usually extended. The pattern signals a regime change more than an entry.',
      confirm: 'Rising or steady volume across the three bars.',
      invalid: 'A close back below the first soldier\'s open.',
      context: 'Beware buying the third bar — by then you are 3 ATR from the mean and your stop is huge.',
      detect: function (bars, i) {
        if (i < 2) return false;
        var a = bars[i - 2], b = bars[i - 1], c = bars[i];
        return bull(a) && bull(b) && bull(c) && b.c > a.c && c.c > b.c &&
          bodyPct(a) > 0.5 && bodyPct(b) > 0.5 && bodyPct(c) > 0.5;
      }
    },
    {
      id: 'three-crows', name: 'Three Black Crows', group: 'Three candle', bias: 'Bearish continuation/reversal', reliability: 'Moderate-high',
      art: [{ o: 80, h: 82, l: 58, c: 60 }, { o: 64, h: 66, l: 40, c: 42 }, { o: 46, h: 48, l: 20, c: 22 }],
      what: 'Three consecutive strong down candles closing near their lows.',
      psychology: 'Sustained, orderly distribution. Each bounce is sold. This is institutional selling, not a panic flush.',
      trade: 'Sell rallies rather than the third crow. Mean reversion after three crows is common and can be violent.',
      confirm: 'Increasing volume.',
      invalid: 'A close back above the first crow\'s open.',
      context: 'A regime signal. Stop taking long continuation setups when you see this.',
      detect: function (bars, i) {
        if (i < 2) return false;
        var a = bars[i - 2], b = bars[i - 1], c = bars[i];
        return bear(a) && bear(b) && bear(c) && b.c < a.c && c.c < b.c &&
          bodyPct(a) > 0.5 && bodyPct(b) > 0.5 && bodyPct(c) > 0.5;
      }
    },
    {
      id: 'three-inside-up', name: 'Three Inside Up', group: 'Three candle', bias: 'Bullish reversal', reliability: 'Moderate',
      art: [{ o: 74, h: 78, l: 30, c: 34 }, { o: 44, h: 56, l: 42, c: 54 }, { o: 54, h: 80, l: 50, c: 78 }],
      what: 'A bullish harami followed by a third candle closing above the first candle\'s open.',
      psychology: 'The harami showed the selling had stopped; the third bar proves buyers took over. It is a harami with its confirmation built in.',
      trade: 'Enter at the third candle\'s close; stop below the harami low.',
      confirm: 'Built into the pattern, which is why it beats a bare harami.',
      invalid: 'A close below the pattern low.',
      context: 'Good example of why confirmation candles raise a pattern\'s reliability.',
      detect: function (bars, i) {
        if (i < 2) return false;
        var a = bars[i - 2], b = bars[i - 1], c = bars[i];
        return bear(a) && bull(b) && b.o > a.c && b.c < a.o && bull(c) && c.c > a.o;
      }
    },
    {
      id: 'three-inside-down', name: 'Three Inside Down', group: 'Three candle', bias: 'Bearish reversal', reliability: 'Moderate',
      art: [{ o: 26, h: 76, l: 22, c: 72 }, { o: 58, h: 64, l: 46, c: 48 }, { o: 46, h: 50, l: 20, c: 24 }],
      what: 'A bearish harami confirmed by a third candle closing below the first candle\'s open.',
      psychology: 'Stall, then supply. The confirmation removes most of the harami\'s ambiguity.',
      trade: 'Short the third close, stop above the harami high.',
      confirm: 'Built in.',
      invalid: 'A close above the pattern high.',
      context: 'Frequently marks the first lower high of a new downtrend.',
      detect: function (bars, i) {
        if (i < 2) return false;
        var a = bars[i - 2], b = bars[i - 1], c = bars[i];
        return bull(a) && bear(b) && b.o < a.c && b.c > a.o && bear(c) && c.c < a.o;
      }
    },
    {
      id: 'abandoned-baby', name: 'Abandoned Baby', group: 'Three candle', bias: 'Reversal (either direction)', reliability: 'High but very rare',
      art: [{ o: 74, h: 78, l: 52, c: 54 }, { o: 40, h: 44, l: 36, c: 40 }, { o: 58, h: 84, l: 56, c: 82 }],
      what: 'A morning/evening star where the middle doji gaps away from BOTH neighbours, leaving it isolated.',
      psychology: 'Capitulation followed by an immediate, violent repricing. The isolated doji is the exhaustion point — nobody wanted to trade there again.',
      trade: 'Enter on the third candle; stop beyond the doji.',
      confirm: 'The gap must not fill immediately.',
      invalid: 'Trading back through the doji range.',
      context: 'Very rare in liquid US large caps (they gap mainly overnight), more common on daily charts after news.',
      detect: function (bars, i) {
        if (i < 2) return false;
        var a = bars[i - 2], s = bars[i - 1], b = bars[i];
        var bullCase = bear(a) && s.h < a.l && s.h < b.l && bull(b) && bodyPct(s) < 0.2;
        var bearCase = bull(a) && s.l > a.h && s.l > b.h && bear(b) && bodyPct(s) < 0.2;
        return bullCase || bearCase;
      }
    },
    {
      id: 'rising-three', name: 'Rising Three Methods', group: 'Three+ candle', bias: 'Bullish continuation', reliability: 'Moderate',
      art: [{ o: 22, h: 78, l: 20, c: 74 }, { o: 68, h: 70, l: 58, c: 60 }, { o: 62, h: 66, l: 52, c: 54 }, { o: 56, h: 62, l: 48, c: 50 }, { o: 54, h: 90, l: 52, c: 88 }],
      what: 'A long up candle, three small down candles that stay inside its range, then another long up candle making new highs.',
      psychology: 'A pause that never threatens the move. Sellers cannot even retrace one bar\'s worth of gain — the textbook definition of a healthy flag.',
      trade: 'Buy the break above the first candle\'s high. Stop below the consolidation low.',
      confirm: 'The fifth candle closing at new highs.',
      invalid: 'Any close below the first candle\'s low.',
      context: 'The candlestick version of a bull flag — same psychology, stricter definition.',
      detect: function (bars, i) {
        if (i < 4) return false;
        var a = bars[i - 4], b = bars[i];
        var mids = [bars[i - 3], bars[i - 2], bars[i - 1]];
        var inside = mids.every(function (m) { return m.h <= a.h && m.l >= a.l; });
        return bull(a) && bodyPct(a) > 0.6 && inside && bull(b) && b.c > a.h;
      }
    },
    {
      id: 'falling-three', name: 'Falling Three Methods', group: 'Three+ candle', bias: 'Bearish continuation', reliability: 'Moderate',
      art: [{ o: 80, h: 82, l: 24, c: 26 }, { o: 32, h: 42, l: 30, c: 40 }, { o: 38, h: 48, l: 36, c: 46 }, { o: 44, h: 54, l: 42, c: 52 }, { o: 48, h: 50, l: 12, c: 14 }],
      what: 'A long down candle, three small up candles contained in its range, then another long down candle to new lows.',
      psychology: 'A weak bounce that never threatens the prior selling. Rallies into supply that cannot clear it.',
      trade: 'Short the break of the first candle\'s low; stop above the consolidation high.',
      confirm: 'New lows on the fifth candle.',
      invalid: 'A close above the first candle\'s high.',
      context: 'The bear flag, formalised.',
      detect: function (bars, i) {
        if (i < 4) return false;
        var a = bars[i - 4], b = bars[i];
        var mids = [bars[i - 3], bars[i - 2], bars[i - 1]];
        var inside = mids.every(function (m) { return m.h <= a.h && m.l >= a.l; });
        return bear(a) && bodyPct(a) > 0.6 && inside && bear(b) && b.c < a.l;
      }
    },
    {
      id: 'nr7', name: 'NR7 (Narrowest Range of 7)', group: 'Volatility', bias: 'Breakout setup', reliability: 'Moderate as a filter',
      art: [{ o: 30, h: 72, l: 22, c: 60 }, { o: 58, h: 76, l: 40, c: 46 }, { o: 48, h: 70, l: 36, c: 64 }, { o: 62, h: 68, l: 54, c: 58 }, { o: 57, h: 62, l: 52, c: 60 }],
      what: 'The current bar has the narrowest high-low range of the last seven bars.',
      psychology: 'Volatility is mean-reverting: extreme contraction is reliably followed by expansion. NR7 does not tell you the direction, only that a move is coming.',
      trade: 'Place a buy stop above the bar and a sell stop below it; the market picks the direction. Risk is tiny because the bar is tiny.',
      confirm: 'The break, on volume.',
      invalid: 'A second NR7 — keep waiting.',
      context: 'Pairs beautifully with Bollinger Band squeeze and low ATR readings.',
      detect: function (bars, i) {
        if (i < 6) return false;
        var r = range(bars[i]);
        for (var j = i - 6; j < i; j++) if (range(bars[j]) <= r) return false;
        return true;
      }
    },
    {
      id: 'wrb', name: 'Wide Range Bar', group: 'Volatility', bias: 'Displacement', reliability: 'Contextual',
      art: [{ o: 40, h: 46, l: 34, c: 42 }, { o: 42, h: 88, l: 38, c: 84 }],
      what: 'A bar whose range is far larger than the recent average (typically > 2× ATR).',
      psychology: 'Something forced participants to reprice immediately. In smart-money language this is "displacement" — and it usually leaves a fair value gap behind it.',
      trade: 'Do not chase it. Mark the bar\'s midpoint and its gap; those become the pullback entries.',
      confirm: 'Whether price holds the wide bar\'s range on the retest.',
      invalid: 'A full retrace through the wide bar — the move was a liquidity grab.',
      context: 'Wide range bars at the end of a long trend are often exhaustion, not continuation. At the start of a move they are ignition.',
      detect: function (bars, i) {
        var atr = TT.ind.atr(bars.slice(0, i + 1), 14)[i];
        return atr ? range(bars[i]) > atr * 2 : false;
      }
    }
  ];

  TT.patterns = P;

  /* Render a pattern as inline SVG. values are on a 0-100 price scale. */
  TT.patternSVG = function (candles, opts) {
    opts = opts || {};
    var w0 = 42, gap = 12, pad = 10;
    // pad narrow patterns out to at least four slots so a single candle is not rendered
    // at a completely different scale from a five-candle pattern
    var slots = Math.max(4, candles.length);
    var W = slots * w0 + (slots - 1) * gap + pad * 2;
    var lead = (slots - candles.length) / 2 * (w0 + gap);
    var H = 120;
    function y(v) { return pad + (100 - v) / 100 * (H - pad * 2); }
    var out = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="candlestick pattern">';
    candles.forEach(function (c, i) {
      var x = pad + lead + i * (w0 + gap), cx = x + w0 / 2;
      var up = c.c >= c.o, col = up ? '#26a96a' : '#e05260';
      out += '<line x1="' + cx + '" y1="' + y(c.h) + '" x2="' + cx + '" y2="' + y(c.l) + '" stroke="' + col + '" stroke-width="2.5"/>';
      var top = y(Math.max(c.o, c.c)), h = Math.max(4, Math.abs(y(c.c) - y(c.o)));
      out += '<rect x="' + x + '" y="' + top + '" width="' + w0 + '" height="' + h + '" fill="' + col + '" rx="2"/>';
    });
    out += '</svg>';
    return out;
  };

  /* Scan real bars for every pattern with a detector. */
  TT.scanPatterns = function (bars, fromIdx) {
    var hits = [];
    var start = Math.max(6, fromIdx == null ? Math.max(6, bars.length - 60) : fromIdx);
    for (var i = start; i < bars.length; i++) {
      P.forEach(function (p) {
        if (!p.detect) return;
        var ok = false;
        try { ok = p.detect(bars, i); } catch (e) { ok = false; }
        if (ok) hits.push({ i: i, id: p.id, name: p.name, bias: p.bias, bar: bars[i] });
      });
    }
    return hits;
  };
  TT.patternById = function (id) {
    for (var i = 0; i < P.length; i++) if (P[i].id === id) return P[i];
    return null;
  };
})(window);
