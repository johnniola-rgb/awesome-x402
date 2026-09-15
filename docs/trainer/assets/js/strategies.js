/* strategies.js — playbooks the trainer can actually grade you against.
   Each strategy carries human-readable rules AND machine checks that run on the bars
   that existed AT YOUR ENTRY. Educational content, not advice. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};

  function P(detail) { return { state: 'pass', detail: detail }; }
  function F(detail) { return { state: 'fail', detail: detail }; }
  function W(detail) { return { state: 'warn', detail: detail }; }
  function NA(detail) { return { state: 'na', detail: detail || 'Not enough data to check.' }; }

  // ---- shared checks reused by many playbooks ----
  var CHK = {
    withTrend: function (ctx) {
      if (!ctx.st || !ctx.st.trend) return NA();
      var t = ctx.st.trend;
      if (t.dir === 0) return W('Structure is a range (' + t.label + '). Trend-continuation entries have no edge here — this is fade territory.');
      if (t.dir === ctx.side) return P('Trading with the higher-timeframe read: ' + t.label + '.');
      return F('You traded AGAINST the prevailing structure (' + t.label + '). Counter-trend entries need a completed reversal signal, not just a feeling.');
    },
    stopBeyondStructure: function (ctx) {
      if (!ctx.stop || !ctx.st) return NA('No stop was attached.');
      var sw = ctx.st.swings, ref;
      if (ctx.side === 1) {
        var lows = sw.lows.filter(function (l) { return l.i <= ctx.i; });
        ref = lows.length ? lows[lows.length - 1] : null;
        if (!ref) return NA();
        return ctx.stop < ref.price
          ? P('Stop sits below the last swing low (' + ref.price.toFixed(2) + ') — it invalidates the idea rather than the noise.')
          : F('Stop is ABOVE the last swing low (' + ref.price.toFixed(2) + '). Price can make a normal higher low and still take you out.');
      }
      var highs = sw.highs.filter(function (h) { return h.i <= ctx.i; });
      ref = highs.length ? highs[highs.length - 1] : null;
      if (!ref) return NA();
      return ctx.stop > ref.price
        ? P('Stop sits above the last swing high (' + ref.price.toFixed(2) + ').')
        : F('Stop is BELOW the last swing high (' + ref.price.toFixed(2) + ') — a routine lower high stops you out.');
    },
    stopVsAtr: function (ctx) {
      if (!ctx.stop || !ctx.snap || !ctx.snap.atr) return NA();
      var d = Math.abs(ctx.entry - ctx.stop) / ctx.snap.atr;
      if (d < 0.5) return F('Stop is only ' + d.toFixed(2) + '× ATR away. Average noise on this chart is 1 ATR — you are paying to be stopped out.');
      if (d < 0.9) return W('Stop is ' + d.toFixed(2) + '× ATR. Tight. Acceptable only if you entered right at the level with an immediate reaction.');
      if (d > 3.5) return W('Stop is ' + d.toFixed(2) + '× ATR — very wide. Either the entry is late or the size has to be tiny to keep risk constant.');
      return P('Stop is ' + d.toFixed(2) + '× ATR — sized to the instrument\'s real volatility.');
    },
    rewardRisk: function (min) {
      return function (ctx) {
        if (!ctx.stop || !ctx.target) return NA('No target was defined, so planned R:R is unknown. Define one even if you intend to trail.');
        var r = Math.abs(ctx.entry - ctx.stop), rew = Math.abs(ctx.target - ctx.entry);
        if (!r) return NA();
        var rr = rew / r;
        if (rr < min - 0.05) return F('Planned reward:risk is ' + rr.toFixed(2) + ':1, below this playbook\'s ' + min + ':1 floor. At ' + rr.toFixed(2) + ':1 you need a ' + (100 / (1 + rr)).toFixed(0) + '%+ win rate just to break even.');
        return P('Planned reward:risk ' + rr.toFixed(2) + ':1 clears the ' + min + ':1 floor (break-even win rate ' + (100 / (1 + rr)).toFixed(0) + '%).');
      };
    },
    notExtended: function (maxAtr) {
      return function (ctx) {
        if (!ctx.snap || !ctx.snap.ema20 || !ctx.snap.atr) return NA();
        var d = (ctx.entry - ctx.snap.ema20) * ctx.side / ctx.snap.atr;
        if (d > maxAtr) return F('Entry is ' + d.toFixed(1) + '× ATR beyond the 20 EMA, past this playbook\'s ' + maxAtr + '× chase limit. The next mean-reversion bar hits your stop first.');
        if (d > maxAtr * 0.7) return W('Entry is ' + d.toFixed(1) + '× ATR beyond the 20 EMA — close to the ' + maxAtr + '× chase limit. A pullback entry would have given you the same idea at a better price.');
        if (d < -1.5) return W('Entry is ' + Math.abs(d).toFixed(1) + '× ATR on the wrong side of the 20 EMA for this direction — early, or catching a falling knife.');
        return P('Entry is ' + d.toFixed(1) + '× ATR from the 20 EMA — under the ' + maxAtr + '× chase limit.');
      };
    },
    volumeConfirm: function (ctx) {
      if (!ctx.snap || ctx.snap.rvol == null) return NA();
      var rv = ctx.snap.rvol;
      if (rv >= 1.5) return P('Relative volume ' + rv.toFixed(2) + '× — real participation behind the move.');
      if (rv >= 1) return W('Relative volume ' + rv.toFixed(2) + '× — average. Breakouts on average volume fail more often than they run.');
      return F('Relative volume ' + rv.toFixed(2) + '× — below average. Low-volume breaks are the classic trap.');
    },
    roomToTarget: function (ctx) {
      if (!ctx.st || !ctx.target) return NA();
      var lvl = TT.struct.nearestLevel(ctx.st.levels, ctx.entry, ctx.side);
      if (!lvl) return P('No prior swing cluster between entry and target.');
      var blocks = ctx.side === 1 ? lvl.price < ctx.target : lvl.price > ctx.target;
      return blocks
        ? W('A ' + lvl.side + ' shelf at ' + lvl.price.toFixed(2) + ' (' + lvl.touches + ' touches) sits between entry and target. Either target that level instead, or expect a fight.')
        : P('Clean air to the target — nearest opposing level (' + lvl.price.toFixed(2) + ') is beyond it.');
    },
    timeOfDay: function (ctx) {
      if (!ctx.intraday || ctx.bar.off == null) return NA();
      var off = ctx.bar.off;
      if (off < 5) return W('Entry in the first 5 minutes. The opening auction prints the widest spreads and the most fake moves of the day.');
      if (off >= 120 && off <= 210) return W('Entry in the 11:30-1:00 lunch lull — thinnest volume, chop, and the lowest follow-through rate of the session.');
      if (off > 355) return W('Entry in the last 5 minutes. Almost no time for the idea to work before you are forced flat.');
      return P('Entered at ' + TT.util.sessionTime(off) + ' — inside a normally liquid part of the session.');
    }
  };
  TT.checks = CHK;

  var LIST = [
    {
      id: 'orb',
      name: 'Opening Range Breakout (ORB)',
      style: 'day', level: 'Beginner', horizon: 'Minutes to hours',
      summary: 'Mark the high and low of the first 5/15/30 minutes. Trade the first clean break of that range in the direction of the day\'s pressure, with the opposite side of the range as your invalidation.',
      why: 'The opening range is where overnight orders, news reactions and the auction all resolve. A decisive break with volume shows one side won the first fight of the day, and the day\'s trend often extends from there.',
      timeframes: ['1m/5m execution', 'Daily chart for context'],
      tools: ['Opening range', 'VWAP', 'Relative volume', 'ATR', 'Prior day high/low'],
      entry: [
        'Define the opening range (OR) — 5, 15 or 30 minutes. Stay consistent; do not switch after the fact.',
        'Wait for a 1m/5m candle to CLOSE outside the range, not just a wick through it.',
        'Volume on the break should be above the session average (RVOL > 1.5 is a good bar).',
        'Price should be on the correct side of VWAP for the direction.',
        'Enter on the break close, or on the first pullback that holds the broken edge.'
      ],
      stopRules: [
        'Aggressive: the other side of the breakout candle.',
        'Standard: the midpoint of the opening range.',
        'Conservative: the opposite end of the opening range (widest, needs the smallest size).'
      ],
      exits: [
        'First target: 1× the opening-range height projected from the break.',
        'Second target: prior day high/low, or the next daily level.',
        'Trail under the 9 EMA on the 5m once you are 1R up.'
      ],
      invalidation: ['Price closes back inside the opening range — the break failed. Failed breaks often run hard the other way.'],
      tips: [
        'Range too wide (> 1.5× the 14-day ATR) means the breakout target is already far away and the stop is expensive. Skip it.',
        'Range too narrow on a dead-volume day means you get whipsawed on both sides.',
        'The second break of the same level in a session is usually worse than the first.'
      ],
      mistakes: ['Buying the wick instead of the close.', 'Using the 5-minute OR on a day with no catalyst and no volume.', 'Taking the break against a strong opposite daily trend.'],
      checklist: [
        { id: 'or', label: 'Broke a real opening range', test: function (ctx) {
            if (!ctx.st || !ctx.st.openingRange) return NA('No opening range available (this looks like a non-intraday dataset).');
            var or = ctx.st.openingRange;
            var brokeUp = ctx.entry > or.hi, brokeDn = ctx.entry < or.lo;
            if (ctx.side === 1 && brokeUp) return P('Entry is above the ' + or.minutes + '-minute opening range high (' + or.hi.toFixed(2) + ').');
            if (ctx.side === -1 && brokeDn) return P('Entry is below the ' + or.minutes + '-minute opening range low (' + or.lo.toFixed(2) + ').');
            if (ctx.entry <= or.hi && ctx.entry >= or.lo) return F('Entry was INSIDE the opening range (' + or.lo.toFixed(2) + '-' + or.hi.toFixed(2) + '). That is chop, not a breakout.');
            return F('Entry is on the wrong side of the opening range for a ' + (ctx.side === 1 ? 'long' : 'short') + '.');
          } },
        { id: 'vwap', label: 'On the right side of VWAP', test: function (ctx) {
            if (!ctx.snap || ctx.snap.vwap == null) return NA();
            var above = ctx.entry > ctx.snap.vwap;
            if ((ctx.side === 1 && above) || (ctx.side === -1 && !above)) return P('Price is ' + (above ? 'above' : 'below') + ' VWAP (' + ctx.snap.vwap.toFixed(2) + ') — institutional flow agrees with the direction.');
            return F('You went ' + (ctx.side === 1 ? 'long below' : 'short above') + ' VWAP (' + ctx.snap.vwap.toFixed(2) + '). You are fighting the session\'s average participant.');
          } },
        { id: 'vol', label: 'Volume expansion on the break', test: CHK.volumeConfirm },
        { id: 'time', label: 'Sensible time of day', test: CHK.timeOfDay },
        { id: 'stop', label: 'Stop outside the range structure', test: CHK.stopBeyondStructure },
        { id: 'rr', label: 'Reward:risk at least 1.5:1', test: CHK.rewardRisk(1.5) }
      ]
    },
    {
      id: 'vwap-reversion',
      name: 'VWAP Reversion / VWAP Bounce',
      style: 'day', level: 'Intermediate', horizon: 'Minutes',
      summary: 'In a trending session, price repeatedly pulls back to VWAP and resumes. Buy the first or second touch of VWAP in an uptrending session (sell it in a downtrending one), with the stop just beyond VWAP.',
      why: 'VWAP is the reference price for a huge amount of institutional execution. Algorithms working large orders are told to beat VWAP, which mechanically creates buying below it in an up session and selling above it in a down one.',
      timeframes: ['1m/5m'],
      tools: ['VWAP + standard-deviation bands', '9/20 EMA', 'Relative volume', 'Prior day close'],
      entry: [
        'Establish session direction first: price has held one side of VWAP for at least the first hour.',
        'Wait for a pullback INTO VWAP (or the first band), not a slice straight through it.',
        'Require a reaction candle at VWAP — a hammer, engulfing bar, or a failed push that closes back on your side.',
        'Enter on the close of the reaction candle.'
      ],
      stopRules: ['Beyond the reaction candle, or 0.2-0.3× ATR past VWAP. If VWAP breaks and holds, the premise is gone.'],
      exits: ['Session high/low, the upper/lower VWAP band, or the prior swing. Take partials into the band and trail the rest.'],
      invalidation: ['A 5-minute close through VWAP against you, especially on rising volume.'],
      tips: ['First and second touches work best; by the fourth touch the level is usually about to break.', 'Sloping VWAP = trend. Flat VWAP = balance, where VWAP behaves like a magnet rather than support.'],
      mistakes: ['Buying VWAP on a day where price is chopping across it every 10 minutes.', 'No reaction candle — buying "at the line" and hoping.'],
      checklist: [
        { id: 'near', label: 'Entry near VWAP', test: function (ctx) {
            if (!ctx.snap || ctx.snap.vwap == null || !ctx.snap.atr) return NA();
            var d = Math.abs(ctx.entry - ctx.snap.vwap) / ctx.snap.atr;
            if (d <= 0.5) return P('Entry is ' + d.toFixed(2) + '× ATR from VWAP — right at the reference.');
            if (d <= 1.2) return W('Entry is ' + d.toFixed(2) + '× ATR from VWAP. Workable but you gave up part of the edge by not waiting for the touch.');
            return F('Entry is ' + d.toFixed(2) + '× ATR away from VWAP (' + ctx.snap.vwap.toFixed(2) + '). That is not a VWAP trade — you chased.');
          } },
        { id: 'side', label: 'Session bias agrees', test: function (ctx) {
            if (!ctx.snap || ctx.snap.vwap == null) return NA();
            var above = ctx.entry >= ctx.snap.vwap;
            return ((ctx.side === 1 && above) || (ctx.side === -1 && !above))
              ? P('Entry is on the ' + (above ? 'buy' : 'sell') + ' side of VWAP, matching the trade direction.')
              : F('You are fading VWAP itself. That is a different (harder) trade than a VWAP bounce.');
          } },
        { id: 'stop', label: 'Stop just beyond VWAP', test: function (ctx) {
            if (!ctx.stop || !ctx.snap || ctx.snap.vwap == null || !ctx.snap.atr) return NA();
            var beyond = ctx.side === 1 ? ctx.stop < ctx.snap.vwap : ctx.stop > ctx.snap.vwap;
            var d = Math.abs(ctx.stop - ctx.snap.vwap) / ctx.snap.atr;
            if (!beyond) return F('Stop is on the same side of VWAP as your entry — VWAP can hold perfectly and still stop you out.');
            if (d > 1.2) return W('Stop is ' + d.toFixed(2) + '× ATR beyond VWAP. Wider than the premise needs; the trade is wrong well before that.');
            return P('Stop sits ' + d.toFixed(2) + '× ATR beyond VWAP — exactly where the idea is proven wrong.');
          } },
        { id: 'time', label: 'Sensible time of day', test: CHK.timeOfDay },
        { id: 'rr', label: 'Reward:risk at least 2:1', test: CHK.rewardRisk(2) }
      ]
    },
    {
      id: 'momo-pullback',
      name: 'Momentum Pullback (9/20 EMA continuation)',
      style: 'both', level: 'Beginner', horizon: 'Minutes to days',
      summary: 'In an established trend, buy the first controlled pullback into the 9 or 20 EMA and enter when the pullback stops going against you.',
      why: 'Trends move in impulse-and-pause. The pause lets late money exit and new money enter at a better price; the resumption is the highest-probability part of the move because the trend is already proven.',
      timeframes: ['5m for day trades', 'Daily for swings'],
      tools: ['9 EMA', '20 EMA', 'ATR', 'Volume', 'Swing structure'],
      entry: [
        'Confirm trend: higher highs and higher lows, price above a rising 20 EMA (mirror for shorts).',
        'Wait for a pullback of 2-5 bars into the 9/20 EMA on LOWER volume than the impulse.',
        'Enter when a bar closes back in the trend direction, or on a break of the pullback\'s high/low.',
        'Skip it if the pullback is deeper than the 50% retrace of the last impulse leg — that is a different market.'
      ],
      stopRules: ['Below the pullback low (longs) / above the pullback high (shorts), padded by ~0.25× ATR so a wick does not clip you.'],
      exits: ['Measured move: project the prior impulse leg from the pullback low. Trail the 9 EMA once 1.5R is in hand.'],
      invalidation: ['A close below the swing low that started the pullback — the trend structure is broken.'],
      tips: ['The FIRST pullback after a break of structure is the cleanest. By the third, the trend is tired.', 'Pullbacks on declining volume are healthy. Pullbacks on rising volume are distribution.'],
      mistakes: ['Entering while the pullback is still falling (no reversal bar).', 'Calling a 70% retrace a "pullback".'],
      checklist: [
        { id: 'trend', label: 'Traded with the trend', test: CHK.withTrend },
        { id: 'ext', label: 'Not chasing an extended move', test: CHK.notExtended(2) },
        { id: 'depth', label: 'Pullback depth is healthy', test: function (ctx) {
            if (!ctx.st || !ctx.st.pullback) return NA();
            var r = ctx.st.pullback.retrace;
            if (r == null || r < 0) return NA();
            if (r > 1) return F('Price retraced more than 100% of the last leg — the structure that made this a trend is already gone.');
            if (r > 0.66) return W('Pullback is ' + (r * 100).toFixed(0) + '% of the leg. Deep. It can still work, but it is closer to a reversal than a continuation.');
            if (r < 0.15) return W('Pullback is only ' + (r * 100).toFixed(0) + '% — barely a pause. You may be buying into the top of the impulse.');
            return P('Pullback retraced ' + (r * 100).toFixed(0) + '% of the prior leg — the classic 23-66% continuation zone.');
          } },
        { id: 'ema', label: 'Entry near the 9/20 EMA', test: function (ctx) {
            if (!ctx.snap || !ctx.snap.ema9 || !ctx.snap.atr) return NA();
            var d9 = Math.abs(ctx.entry - ctx.snap.ema9) / ctx.snap.atr;
            var d20 = ctx.snap.ema20 ? Math.abs(ctx.entry - ctx.snap.ema20) / ctx.snap.atr : 99;
            var d = Math.min(d9, d20);
            if (d <= 0.6) return P('Entry is ' + d.toFixed(2) + '× ATR from the 9/20 EMA — right in the pullback zone.');
            if (d <= 1.3) return W('Entry is ' + d.toFixed(2) + '× ATR from the EMAs. You entered before the pullback finished, or after it already resumed.');
            return F('Entry is ' + d.toFixed(2) + '× ATR from the 9/20 EMA. This is not a pullback entry.');
          } },
        { id: 'stop', label: 'Stop beyond pullback structure', test: CHK.stopBeyondStructure },
        { id: 'atr', label: 'Stop respects volatility', test: CHK.stopVsAtr },
        { id: 'rr', label: 'Reward:risk at least 2:1', test: CHK.rewardRisk(2) }
      ]
    },
    {
      id: 'break-retest',
      name: 'Break and Retest (BOS → retest)',
      style: 'both', level: 'Intermediate', horizon: 'Minutes to days',
      summary: 'Price breaks a level with force (break of structure), then comes back to it. Old resistance should now act as support. Enter on the retest, not the break.',
      why: 'The break tells you who is in control; the retest gives you a defined risk point. If the level fails to hold on the retest, the break was a trap and you are out for a small loss.',
      timeframes: ['Any — the logic is fractal'],
      tools: ['Horizontal S/R', 'Break of structure', 'Volume', 'ATR'],
      entry: [
        'Require a decisive CLOSE through the level with expanded volume (the displacement).',
        'Wait for price to return to the broken level, ideally within a few bars.',
        'Enter when the retest holds — a wick rejection, a doji-then-go, or an engulfing bar off the level.'
      ],
      stopRules: ['Just beyond the retest low/high, which is usually a little past the level itself.'],
      exits: ['Measured move = height of the prior range projected from the break. Scale at the first target, trail the rest.'],
      invalidation: ['A close back through the level — the market rejected the break.'],
      tips: ['No retest is not a failure; it just means you sit out. Chasing the un-retested break is how you buy the high.', 'Volume should DRY UP on the retest. Heavy volume on the retest often means the level is failing.'],
      mistakes: ['Entering on the break candle itself with a stop 3 ATR away.', 'Treating a level with one touch as "structure".'],
      checklist: [
        { id: 'bos', label: 'A real break of structure preceded the entry', test: function (ctx) {
            if (!ctx.st) return NA();
            var recent = ctx.st.breaks.filter(function (b) { return b.i <= ctx.i && b.i >= ctx.i - 25; });
            var aligned = recent.filter(function (b) { return b.dir === ctx.side; });
            if (!recent.length) return F('No break of structure in the last 25 bars. There is nothing to retest.');
            if (!aligned.length) return F('The most recent structural break went the OTHER way (' + recent[recent.length - 1].type + ' ' + (recent[recent.length - 1].dir === 1 ? 'up' : 'down') + ').');
            var b = aligned[aligned.length - 1];
            return P(b.type + ' ' + (b.dir === 1 ? 'up' : 'down') + ' through ' + b.level.toFixed(2) + ', ' + (ctx.i - b.i) + ' bars before your entry.');
          } },
        { id: 'retest', label: 'Entry is at the retested level', test: function (ctx) {
            if (!ctx.st || !ctx.snap || !ctx.snap.atr) return NA();
            var recent = ctx.st.breaks.filter(function (b) { return b.i <= ctx.i && b.dir === ctx.side && b.i >= ctx.i - 25; });
            if (!recent.length) return NA();
            var lvl = recent[recent.length - 1].level;
            var d = Math.abs(ctx.entry - lvl) / ctx.snap.atr;
            if (d <= 0.6) return P('Entry is ' + d.toFixed(2) + '× ATR from the broken level (' + lvl.toFixed(2) + ') — a genuine retest entry.');
            if (d <= 1.5) return W('Entry is ' + d.toFixed(2) + '× ATR from the broken level. You did not really wait for the retest.');
            return F('Entry is ' + d.toFixed(2) + '× ATR beyond the level — this is a chase, and your stop has to be huge.');
          } },
        { id: 'vol', label: 'Volume supported the break', test: CHK.volumeConfirm },
        { id: 'stop', label: 'Stop beyond the level', test: CHK.stopBeyondStructure },
        { id: 'rr', label: 'Reward:risk at least 2:1', test: CHK.rewardRisk(2) }
      ]
    },
    {
      id: 'gap-go',
      name: 'Gap and Go',
      style: 'day', level: 'Advanced', horizon: 'Minutes',
      summary: 'A stock gaps on a catalyst, holds its gap in the first minutes, and continues in the gap direction. You are trading the continuation, not the gap itself.',
      why: 'An overnight catalyst repricing a stock creates trapped shorts (gap up) or trapped longs (gap down) plus real institutional demand that cannot be filled in one print.',
      timeframes: ['1m/5m'],
      tools: ['Pre-market high/low', 'Prior day close', 'Relative volume', 'VWAP', 'Float/news context'],
      entry: [
        'Gap should be meaningful (> 2% and ideally > 1 ATR) and backed by news plus heavy relative volume.',
        'Price must HOLD the gap — no immediate fill back toward the prior close.',
        'Enter on a break of the pre-market high (gap up) after a first pullback holds above VWAP.'
      ],
      stopRules: ['Under the first pullback low or VWAP, whichever is tighter and still structurally valid.'],
      exits: ['Prior swing highs, round numbers, or a 1× measured move of the opening drive. Be quick — gap continuation is a morning trade.'],
      invalidation: ['Price closes below VWAP and fails to reclaim it — the gap is filling.'],
      tips: ['Gap-and-go is the fastest, most volatile setup in the trainer. Size down, not up.', 'A gap into a major daily resistance level is a gap FADE candidate, not a go.'],
      mistakes: ['Chasing a stock already up 20% at the open with a stop at the low of day.', 'Trading gaps with no volume — nobody is there and the spread eats you.'],
      checklist: [
        { id: 'gap', label: 'There actually was a gap', test: function (ctx) {
            if (!ctx.gap) return NA('No prior-session close available for this dataset.');
            var g = ctx.gap;
            if (Math.abs(g.pct) < 1) return F('Gap was only ' + g.pct.toFixed(2) + '%. There is no catalyst here — it is a normal open.');
            if (g.dir !== ctx.side) return F('You traded ' + (ctx.side === 1 ? 'long' : 'short') + ' into a ' + g.pct.toFixed(2) + '% gap the other way. That is a gap FADE, a different playbook.');
            return P('Gap of ' + g.pct.toFixed(2) + '% in your direction.');
          } },
        { id: 'vwap', label: 'Holding the right side of VWAP', test: function (ctx) {
            if (!ctx.snap || ctx.snap.vwap == null) return NA();
            return ((ctx.side === 1 && ctx.entry > ctx.snap.vwap) || (ctx.side === -1 && ctx.entry < ctx.snap.vwap))
              ? P('Price is holding the correct side of VWAP.')
              : F('The gap is already failing — price is on the wrong side of VWAP.');
          } },
        { id: 'vol', label: 'Heavy relative volume', test: CHK.volumeConfirm },
        { id: 'time', label: 'Morning session', test: function (ctx) {
            if (!ctx.intraday || ctx.bar.off == null) return NA();
            return ctx.bar.off <= 90 ? P('Entered ' + TT.util.sessionTime(ctx.bar.off) + ' — inside the window where gap continuation actually works.')
              : W('Entered ' + TT.util.sessionTime(ctx.bar.off) + '. Gap-and-go is a first-90-minute trade; later entries are usually the fade.');
          } },
        { id: 'atr', label: 'Stop respects volatility', test: CHK.stopVsAtr },
        { id: 'rr', label: 'Reward:risk at least 2:1', test: CHK.rewardRisk(2) }
      ]
    },
    {
      id: 'failed-break',
      name: 'Failed Breakout / Liquidity Sweep Reversal',
      style: 'both', level: 'Advanced', horizon: 'Minutes to days',
      summary: 'Price pokes through an obvious high or low, triggers the stops resting there, and immediately closes back inside the range. You trade the reversal, with the sweep wick as your stop.',
      why: 'Obvious levels hold obvious stop orders. Sweeping them is how large orders get filled. When the break cannot hold, the breakout traders themselves become the fuel for the move against them.',
      timeframes: ['Any'],
      tools: ['Swing highs/lows', 'Prior day high/low', 'Volume', 'Candle reversal patterns'],
      entry: [
        'Identify a level everyone can see (prior day high/low, range edge, round number, session high).',
        'Price must trade THROUGH it and then close back inside within 1-3 bars.',
        'Enter on the reclaim close; a long wick plus a strong close back inside is the signature.'
      ],
      stopRules: ['Beyond the sweep wick. If price goes back out there, the break was real after all.'],
      exits: ['The opposite side of the range. These moves often travel the full range height.'],
      invalidation: ['A close back outside the level in the breakout direction.'],
      tips: ['This is the highest-conviction reversal pattern in the trainer, but it requires patience and a fast hand.', 'Best when the sweep happens on a volume spike that immediately dies.'],
      mistakes: ['Front-running the sweep (shorting into strength before the reclaim).', 'Ignoring the daily trend — sweeps against a strong trend often just continue.'],
      checklist: [
        { id: 'sweep', label: 'A sweep actually happened', test: function (ctx) {
            if (!ctx.st) return NA();
            var recent = ctx.st.sweeps.filter(function (s) { return s.i <= ctx.i && s.i >= ctx.i - 6 && s.dir === ctx.side; });
            return recent.length
              ? P('Detected: ' + recent[recent.length - 1].kind + ' at ' + recent[recent.length - 1].level.toFixed(2) + ', ' + (ctx.i - recent[recent.length - 1].i) + ' bars before entry.')
              : F('No liquidity sweep in your direction within the last 6 bars. Without the sweep-and-reclaim this is just a counter-trend guess.');
          } },
        { id: 'stopwick', label: 'Stop is beyond the sweep wick', test: function (ctx) {
            if (!ctx.stop || !ctx.st) return NA();
            var recent = ctx.st.sweeps.filter(function (s) { return s.i <= ctx.i && s.i >= ctx.i - 6 && s.dir === ctx.side; });
            if (!recent.length) return NA();
            var s = recent[recent.length - 1], wick = ctx.side === 1 ? ctx.bars[s.i].l : ctx.bars[s.i].h;
            var ok = ctx.side === 1 ? ctx.stop <= wick : ctx.stop >= wick;
            return ok ? P('Stop is beyond the sweep extreme (' + wick.toFixed(2) + ') — correct invalidation point.')
              : F('Stop is INSIDE the sweep wick (extreme was ' + wick.toFixed(2) + '). A second poke at the same liquidity takes you out before the reversal runs.');
          } },
        { id: 'rr', label: 'Reward:risk at least 2.5:1', test: CHK.rewardRisk(2.5) },
        { id: 'room', label: 'Room to the target', test: CHK.roomToTarget }
      ]
    },
    {
      id: 'bull-flag',
      name: 'Flag / Pennant Continuation',
      style: 'both', level: 'Beginner', horizon: 'Minutes to days',
      summary: 'A sharp impulse (the pole) followed by a tight, low-volume drift against it (the flag). Enter on the break of the flag in the direction of the pole.',
      why: 'The tight consolidation says holders are not selling into strength. The breakout resolves the compression, and the measured move gives you an objective target.',
      timeframes: ['Any'],
      tools: ['Volume', 'ATR', 'Trendlines', 'Donchian channel'],
      entry: ['Pole: a strong directional move on above-average volume.', 'Flag: 3-10 bars of shallow, orderly pullback on declining volume.', 'Enter on the close above the flag high (longs).'],
      stopRules: ['Below the flag low. If the flag breaks down, the pattern is void.'],
      exits: ['Measured move: add the pole height to the breakout point.'],
      invalidation: ['Flag retraces more than ~50% of the pole, or volume expands against the pole direction.'],
      tips: ['Tighter flags = better trades. A sloppy, wide flag is just a reversal forming slowly.', 'The best flags form near the highs, not at the halfway point of the pole.'],
      mistakes: ['Trading a "flag" that is actually a deep, volatile pullback.', 'Buying inside the flag rather than on the break.'],
      checklist: [
        { id: 'trend', label: 'Traded with the trend', test: CHK.withTrend },
        { id: 'tight', label: 'Consolidation was tight', test: function (ctx) {
            if (!ctx.st || !ctx.st.range) return NA();
            var r = ctx.st.range;
            if (r.height < r.atr * 2.5) return P('Last 20 bars spanned ' + (r.height / r.atr).toFixed(1) + '× ATR — a genuine coil.');
            if (r.height < r.atr * 5) return W('Last 20 bars spanned ' + (r.height / r.atr).toFixed(1) + '× ATR — loose for a flag.');
            return F('Last 20 bars spanned ' + (r.height / r.atr).toFixed(1) + '× ATR. That is a trading range, not a flag.');
          } },
        { id: 'vol', label: 'Volume expansion on the break', test: CHK.volumeConfirm },
        { id: 'stop', label: 'Stop below the flag', test: CHK.stopBeyondStructure },
        { id: 'rr', label: 'Reward:risk at least 2:1', test: CHK.rewardRisk(2) }
      ]
    },
    {
      id: 'ema-pullback-swing',
      name: 'Swing Pullback to the 20/50 EMA',
      style: 'swing', level: 'Beginner', horizon: 'Days to weeks',
      summary: 'On the daily chart, buy an established uptrend when it pulls back to the rising 20 or 50 EMA and prints a reversal candle.',
      why: 'Institutional accumulation shows up as repeated defence of the same moving average. You are buying where the last several dips were bought, with an objective invalidation right underneath.',
      timeframes: ['Daily execution', 'Weekly for context'],
      tools: ['20/50/200 EMA', 'ATR (daily)', 'Volume', 'Relative strength vs SPY', 'Earnings date'],
      entry: [
        'Price above a rising 50 EMA, and ideally above the 200 EMA (the long-term trend filter).',
        'Pullback touches or slightly undercuts the 20 or 50 EMA.',
        'Entry trigger: a bullish reversal candle (hammer, engulfing, inside-bar break) closing back above the EMA.'
      ],
      stopRules: ['Below the pullback low, padded 0.5× daily ATR. On a daily chart this is often 3-8% — size accordingly.'],
      exits: ['Prior high, a measured move, or trail the 20 EMA on a closing basis. Many swing traders take half at 2R.'],
      invalidation: ['Daily close below the 50 EMA with expanding volume, or a break of the prior swing low.'],
      tips: [
        'Check the earnings date BEFORE entering. Holding a swing through earnings is a coin flip that can gap straight through your stop.',
        'Overnight gaps mean your stop is not a guarantee — this is the core difference between swing risk and day-trade risk.'
      ],
      mistakes: ['Buying a "pullback" in a stock whose 50 EMA is already rolling over.', 'Using day-trade position size on a swing with a 6% stop.'],
      checklist: [
        { id: 'trend', label: 'Traded with the trend', test: CHK.withTrend },
        { id: 'ma', label: 'Above the long-term average (longs)', test: function (ctx) {
            if (!ctx.snap || !ctx.snap.ema200) return NA('Not enough history for a 200-period average.');
            var above = ctx.entry > ctx.snap.ema200;
            if (ctx.side === 1) return above ? P('Price is above the 200 EMA — long side of the long-term trend.') : W('Price is BELOW the 200 EMA. Long swings below the 200 fail far more often; at minimum, size down.');
            return !above ? P('Price is below the 200 EMA — short side of the long-term trend.') : W('Price is ABOVE the 200 EMA. Shorting strong stocks is an expert trade.');
          } },
        { id: 'ema', label: 'Entry at the 20/50 EMA', test: function (ctx) {
            if (!ctx.snap || !ctx.snap.atr) return NA();
            var ds = [];
            if (ctx.snap.ema20) ds.push(Math.abs(ctx.entry - ctx.snap.ema20) / ctx.snap.atr);
            if (ctx.snap.ema50) ds.push(Math.abs(ctx.entry - ctx.snap.ema50) / ctx.snap.atr);
            if (!ds.length) return NA();
            var d = Math.min.apply(null, ds);
            if (d <= 0.8) return P('Entry is ' + d.toFixed(2) + '× ATR from the 20/50 EMA — in the zone.');
            if (d <= 1.8) return W('Entry is ' + d.toFixed(2) + '× ATR from the EMAs — early or late.');
            return F('Entry is ' + d.toFixed(2) + '× ATR from the EMAs; this is not the pullback entry the playbook describes.');
          } },
        { id: 'ext', label: 'Not chasing', test: CHK.notExtended(2.5) },
        { id: 'stop', label: 'Stop beyond swing structure', test: CHK.stopBeyondStructure },
        { id: 'rr', label: 'Reward:risk at least 2:1', test: CHK.rewardRisk(2) }
      ]
    },
    {
      id: 'base-breakout',
      name: 'Base Breakout / Volatility Contraction',
      style: 'swing', level: 'Intermediate', horizon: 'Weeks',
      summary: 'A stock builds a multi-week base with progressively tighter ranges and drying volume, then breaks out of the base on a volume surge.',
      why: 'Contraction means supply is exhausted — sellers have finished. The breakout is the moment demand has to pay up. This is the classic Darvas / O\'Neil / Minervini structure.',
      timeframes: ['Daily execution', 'Weekly base structure'],
      tools: ['Donchian/pivot high', 'Volume (dry-up then surge)', 'Bollinger Band width', 'ATR', '50/200 EMA'],
      entry: ['Base of at least 3-4 weeks with narrowing ranges.', 'Volume dries up into the right side of the base.', 'Buy the breakout above the base pivot on a volume surge (ideally 1.5×+ average).'],
      stopRules: ['Below the last tight area inside the base — not the bottom of the whole base, which is usually too far.'],
      exits: ['Measured move of the base depth, or trail the 20 EMA. Reduce into the first 8-10% gain if the move goes vertical.'],
      invalidation: ['A close back inside the base on volume — a failed breakout is an immediate exit, not a hold-and-hope.'],
      tips: ['Bollinger Band width at a multi-month low is a quantifiable "squeeze".', 'Most breakouts retest. Decide in advance whether you buy the breakout or the retest — doing both doubles your risk.'],
      mistakes: ['Buying the 4th breakout of an extended run (late-stage base).', 'Ignoring volume entirely.'],
      checklist: [
        { id: 'tight', label: 'Real contraction before the break', test: function (ctx) {
            if (!ctx.st || !ctx.st.range) return NA();
            var r = ctx.st.range;
            return r.height < r.atr * 5
              ? P('20-bar range is ' + (r.height / r.atr).toFixed(1) + '× ATR — contracted.')
              : F('20-bar range is ' + (r.height / r.atr).toFixed(1) + '× ATR. There is no contraction here to break out of.');
          } },
        { id: 'vol', label: 'Volume surge on the break', test: CHK.volumeConfirm },
        { id: 'trend', label: 'Base sits in an uptrend', test: CHK.withTrend },
        { id: 'stop', label: 'Stop inside the base structure', test: CHK.stopVsAtr },
        { id: 'rr', label: 'Reward:risk at least 2.5:1', test: CHK.rewardRisk(2.5) }
      ]
    },
    {
      id: 'range-fade',
      name: 'Range Fade (support/resistance rotation)',
      style: 'both', level: 'Intermediate', horizon: 'Minutes to days',
      summary: 'In a clearly defined range, sell the top and buy the bottom — with tight invalidation just outside the range.',
      why: 'Markets spend most of their time in balance. When ADX is low and price has reversed at the same two prices repeatedly, the odds favour rotation over breakout.',
      timeframes: ['Any'],
      tools: ['Horizontal S/R', 'ADX (low = range)', 'Bollinger Bands', 'RSI/Stochastic', 'Volume profile (value area)'],
      entry: ['Range must have at least 2 touches per side.', 'Enter on the reaction at the edge — a rejection wick or failure to make a new extreme.', 'Momentum divergence at the edge adds conviction.'],
      stopRules: ['Just outside the range edge, beyond the rejection wick.'],
      exits: ['The opposite edge or the range midpoint / point of control. Do not hold for a breakout you did not plan for.'],
      invalidation: ['A close outside the range. Ranges end with breaks, and fading a breakout is how range traders blow up.'],
      tips: ['Check ADX: below 20 favours fading; above 25 means stop fading and start trading breaks.', 'The volume-profile point of control is usually the magnet inside the range.'],
      mistakes: ['Fading a strong trend and calling it a range.', 'No stop, because "it has to come back".'],
      checklist: [
        { id: 'isRange', label: 'Market is actually ranging', test: function (ctx) {
            if (!ctx.snap || ctx.snap.adx == null) return NA();
            if (ctx.snap.adx < 20) return P('ADX ' + ctx.snap.adx.toFixed(0) + ' — balance. Rotation is the higher-probability behaviour.');
            if (ctx.snap.adx < 25) return W('ADX ' + ctx.snap.adx.toFixed(0) + ' — borderline. Fades work until they suddenly do not.');
            return F('ADX ' + ctx.snap.adx.toFixed(0) + ' — this is a trending market. Fading a trend is the most expensive habit in retail trading.');
          } },
        { id: 'edge', label: 'Entry at the range edge', test: function (ctx) {
            if (!ctx.st || !ctx.st.range || !ctx.snap || !ctx.snap.atr) return NA();
            var r = ctx.st.range;
            var edge = ctx.side === 1 ? r.lo : r.hi;
            var d = Math.abs(ctx.entry - edge) / ctx.snap.atr;
            if (d <= 0.7) return P('Entry is ' + d.toFixed(2) + '× ATR from the range ' + (ctx.side === 1 ? 'low' : 'high') + ' — you got the edge.');
            if (d <= 1.5) return W('Entry is ' + d.toFixed(2) + '× ATR inside the range. Worse price, same stop distance.');
            return F('Entry is ' + d.toFixed(2) + '× ATR from the edge — that is mid-range, the worst place to initiate.');
          } },
        { id: 'stop', label: 'Stop just outside the range', test: CHK.stopVsAtr },
        { id: 'rr', label: 'Reward:risk at least 2:1', test: CHK.rewardRisk(2) }
      ]
    },
    {
      id: 'ma-cross',
      name: 'Moving Average Crossover (trend following)',
      style: 'swing', level: 'Beginner', horizon: 'Weeks',
      summary: 'A mechanical, rules-only trend system: go long when the fast average crosses above the slow one and exit when it crosses back. Included because it is the clearest way to feel what a low-win-rate / high-payoff system does to you psychologically.',
      why: 'Crossovers lag by design. They catch the middle of big moves and give back a piece at every reversal. Win rate is often below 40% while expectancy stays positive — which is exactly the emotional test most traders fail.',
      timeframes: ['Daily'],
      tools: ['EMA 20/50 (or 50/200)', 'ADX', 'ATR for sizing'],
      entry: ['Fast EMA crosses above slow EMA and price closes above both.', 'Optional filter: only take crosses with ADX > 20.'],
      stopRules: ['Below the slow EMA, or 2× ATR below entry, whichever is closer to a structural level.'],
      exits: ['Opposite cross, or a trailing 2-3× ATR stop.'],
      invalidation: ['The cross reverses.'],
      tips: ['Expect long strings of small losses in chop. If you cannot sit through 6 losers in a row, this is not your system.', 'Do not optimise the lengths to fit the last 6 months — that is curve fitting and it will not repeat.'],
      mistakes: ['Abandoning the system after 3 losses, which is statistically normal.', 'Adding discretionary overrides that destroy the tested edge.'],
      checklist: [
        { id: 'cross', label: 'Fast EMA on the right side of slow EMA', test: function (ctx) {
            if (!ctx.snap || !ctx.snap.ema20 || !ctx.snap.ema50) return NA();
            var bull = ctx.snap.ema20 > ctx.snap.ema50;
            return ((ctx.side === 1 && bull) || (ctx.side === -1 && !bull))
              ? P('20 EMA is ' + (bull ? 'above' : 'below') + ' the 50 EMA — the system says ' + (bull ? 'long' : 'short') + '.')
              : F('You took a ' + (ctx.side === 1 ? 'long' : 'short') + ' while the 20 EMA is ' + (bull ? 'above' : 'below') + ' the 50 EMA. That is an override, not the system.');
          } },
        { id: 'adx', label: 'Trending conditions', test: function (ctx) {
            if (!ctx.snap || ctx.snap.adx == null) return NA();
            return ctx.snap.adx >= 20 ? P('ADX ' + ctx.snap.adx.toFixed(0) + ' — trend present.') : W('ADX ' + ctx.snap.adx.toFixed(0) + ' — crossovers in chop are the main source of this system\'s losses.');
          } },
        { id: 'atr', label: 'Stop respects volatility', test: CHK.stopVsAtr },
        { id: 'rr', label: 'Reward:risk at least 1.5:1', test: CHK.rewardRisk(1.5) }
      ]
    },
    {
      id: 'mean-revert',
      name: 'Extension Snapback (short-term mean reversion)',
      style: 'swing', level: 'Advanced', horizon: 'Days',
      summary: 'Buy short-term panic inside a longer-term uptrend: price stretched far below its 20-period average with an oversold short-period RSI, then exit on the snapback to the mean.',
      why: 'Short-term selling exhausts itself. When a stock in a structural uptrend gets 2+ ATR below its 20 EMA, the short-term expected return is positive even though it feels terrible to buy.',
      timeframes: ['Daily'],
      tools: ['RSI(2) or RSI(3)', 'Bollinger Bands', 'ATR distance from 20 EMA', '200 EMA trend filter'],
      entry: ['Price above the 200 EMA (regime filter).', 'RSI(2) below ~10, or price below the lower Bollinger Band.', 'Enter on the close, or on the first up-close for confirmation.'],
      stopRules: ['Wide — 2-3× ATR. Mean reversion needs room; a tight stop guarantees you exit at the worst price.'],
      exits: ['Close above the 5 or 10 period MA, or a fixed 3-5 day time stop. These trades are supposed to be short.'],
      invalidation: ['A close below the 200 EMA — the regime the edge depends on is gone.'],
      tips: [
        'High win rate, small average win, occasional very large loss. Respect the tail: never average down.',
        'A time stop matters as much as a price stop. If the snapback has not happened in 5 days, the premise failed.'
      ],
      mistakes: ['Running this in a bear market (below the 200 EMA), where every dip keeps dipping.', 'Sizing up because "it has worked 9 times in a row".'],
      checklist: [
        { id: 'regime', label: 'Long-term regime filter', test: function (ctx) {
            if (!ctx.snap || !ctx.snap.ema200) return NA();
            return ctx.entry > ctx.snap.ema200 ? P('Price above the 200 EMA — the regime this edge requires.')
              : F('Price is below the 200 EMA. Buying dips in a downtrend is how mean-reversion accounts die.');
          } },
        { id: 'stretch', label: 'Genuinely stretched', test: function (ctx) {
            if (!ctx.snap || !ctx.snap.ema20 || !ctx.snap.atr) return NA();
            var d = (ctx.snap.ema20 - ctx.entry) / ctx.snap.atr * ctx.side;
            if (d >= 1.5) return P('Entry is ' + d.toFixed(1) + '× ATR beyond the 20 EMA in your favour — a real extension.');
            if (d >= 0.6) return W('Only ' + d.toFixed(1) + '× ATR from the mean. Mild stretch, thinner edge.');
            return F('Price is not stretched (' + d.toFixed(1) + '× ATR). There is nothing to revert.');
          } },
        { id: 'rsi', label: 'Momentum washed out', test: function (ctx) {
            if (!ctx.snap || ctx.snap.rsi == null) return NA();
            if (ctx.side === 1) return ctx.snap.rsi < 35 ? P('RSI(14) at ' + ctx.snap.rsi.toFixed(0) + ' — sellers stretched.') : W('RSI(14) at ' + ctx.snap.rsi.toFixed(0) + ' — not washed out yet.');
            return ctx.snap.rsi > 65 ? P('RSI(14) at ' + ctx.snap.rsi.toFixed(0) + ' — buyers stretched.') : W('RSI(14) at ' + ctx.snap.rsi.toFixed(0) + ' — not extended yet.');
          } },
        { id: 'atr', label: 'Stop wide enough for reversion', test: function (ctx) {
            if (!ctx.stop || !ctx.snap || !ctx.snap.atr) return NA();
            var d = Math.abs(ctx.entry - ctx.stop) / ctx.snap.atr;
            return d >= 1.5 ? P('Stop is ' + d.toFixed(2) + '× ATR — enough room for a volatile snapback.')
              : F('Stop is only ' + d.toFixed(2) + '× ATR. Mean-reversion entries are volatile by definition; this stop will be hit by noise.');
          } }
      ]
    },
    {
      id: 'discretionary',
      name: 'Freestyle / No playbook',
      style: 'both', level: 'Any', horizon: 'Any',
      summary: 'No strategy filter. The coach still grades universal risk mechanics: sizing, stop placement, reward:risk, timing and trade management.',
      why: 'Useful for exploring, but note that "freestyle" is also the label for how most losing accounts trade. The Strategy tab exists so that every trade has a pre-defined reason.',
      timeframes: ['Any'], tools: ['Whatever is on your chart'],
      entry: ['Write down your reason BEFORE you click. The journal field is there for exactly this.'],
      stopRules: ['Every trade gets a stop. No exceptions.'],
      exits: ['Decide your target before entry, even if you plan to trail.'],
      invalidation: ['Whatever you wrote down.'],
      tips: ['If you cannot state the setup in one sentence, you do not have one.'],
      mistakes: ['Trading because you are bored, or because you are down and want it back.'],
      checklist: [
        { id: 'trend', label: 'Direction vs structure', test: CHK.withTrend },
        { id: 'stop', label: 'Stop beyond structure', test: CHK.stopBeyondStructure },
        { id: 'atr', label: 'Stop respects volatility', test: CHK.stopVsAtr },
        { id: 'rr', label: 'Reward:risk at least 1.5:1', test: CHK.rewardRisk(1.5) },
        { id: 'time', label: 'Sensible time of day', test: CHK.timeOfDay }
      ]
    }
  ];

  TT.strategies = LIST;
  TT.strategyById = function (id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return LIST[LIST.length - 1];
  };
})(window);
