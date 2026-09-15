/* review.js — the coaching engine.
   Pre-trade: checks a plan BEFORE it is submitted (this is where money is actually saved).
   Post-trade: grades entry, stop, target, exit, sizing and management using the bars that
   existed at the time, then shows what happened AFTER the exit so hindsight becomes a lesson
   instead of a regret. Educational feedback only — never a recommendation to trade. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};
  var U = TT.util;
  var R = TT.review = {};

  /* Build the analysis context as of bar `idx` — only bars 0..idx are used. */
  R.context = function (sim, idx, side, entry, stop, target) {
    var bars = sim.bars.slice(0, idx + 1);
    if (bars.length < 12) return null;
    var intraday = !!sim.ds.intraday;
    var snap = TT.ind.snapshot(bars, { intraday: intraday, vwapReset: intraday ? function (b, i, arr) {
      return i > 0 && arr[i - 1].day && b.day && arr[i - 1].day !== b.day;
    } : null });
    var st = TT.struct.analyze(bars, { intraday: intraday, orMinutes: sim.orMinutes || 15 });
    var gap = null;
    if (intraday) {
      // previous session's last close vs this session's first bar
      var bar = bars[bars.length - 1], firstIdx = -1, prevClose = null;
      for (var i = bars.length - 1; i > 0; i--) {
        if (bars[i].day !== bars[i - 1].day) { firstIdx = i; prevClose = bars[i - 1].c; break; }
      }
      if (firstIdx > 0) gap = TT.struct.gap(prevClose, bars[firstIdx].o);
    }
    return {
      bars: bars, i: idx, bar: bars[bars.length - 1], side: side, entry: entry,
      stop: stop, target: target, snap: snap, st: st, gap: gap, intraday: intraday, sim: sim
    };
  };

  function stateIcon(s) { return s === 'pass' ? '✓' : s === 'fail' ? '✕' : s === 'warn' ? '!' : '·'; }
  function stateClass(s) { return s === 'pass' ? 'ok' : s === 'fail' ? 'bad' : s === 'warn' ? 'warn' : 'muted'; }
  R.stateIcon = stateIcon; R.stateClass = stateClass;

  /* ---------------- PRE-TRADE ---------------- */
  R.preTrade = function (sim, plan) {
    // plan: {side:'long'|'short', qty, entry, stop, target, strategyId, riskPct}
    var side = plan.side === 'long' ? 1 : -1;
    var ctx = R.context(sim, sim.cursor, side, plan.entry, plan.stop, plan.target);
    var items = [], blockers = 0, warns = 0, stratFails = 0;

    function add(state, label, detail, kind) {
      items.push({ state: state, label: label, detail: detail, kind: kind || 'mechanics' });
      if (state === 'fail') { if (kind === 'strategy') stratFails++; else blockers++; }
      if (state === 'warn') warns++;
    }

    // --- non-negotiable mechanics ---
    if (!plan.stop) {
      add('fail', 'No stop loss', 'A trade without a stop has undefined risk. In a real account this is the single fastest way to turn a small mistake into an account-ending one.');
    } else {
      var wrongSide = side === 1 ? plan.stop >= plan.entry : plan.stop <= plan.entry;
      if (wrongSide) add('fail', 'Stop is on the wrong side', 'For a ' + plan.side + ', the stop must be ' + (side === 1 ? 'below' : 'above') + ' the entry.');
    }
    if (plan.target) {
      var tWrong = side === 1 ? plan.target <= plan.entry : plan.target >= plan.entry;
      if (tWrong) add('fail', 'Target is on the wrong side', 'For a ' + plan.side + ', the target must be ' + (side === 1 ? 'above' : 'below') + ' the entry.');
    } else {
      add('warn', 'No target defined', 'Without a target you cannot compute reward:risk before you commit — which means you cannot know whether the trade is worth taking.');
    }

    // --- risk ---
    var risk = plan.stop ? Math.abs(plan.entry - plan.stop) * plan.qty : null;
    var eq = sim.equity();
    var riskPct = risk != null && eq ? risk / eq * 100 : null;
    if (riskPct != null) {
      if (riskPct > 5) add('fail', 'Risk ' + riskPct.toFixed(2) + '% of account', 'Risking ' + U.money(risk) + ' of a ' + U.money(eq) + ' account. Six losses in a row at this size — a normal streak — cuts the account by roughly ' + (100 - Math.pow(1 - riskPct / 100, 6) * 100).toFixed(0) + '%.');
      else if (riskPct > 2) add('warn', 'Risk ' + riskPct.toFixed(2) + '% of account', 'Above the 1-2% guideline most professionals use. Survivable, but the drawdowns will feel severe.');
      else if (riskPct < 0.1) add('warn', 'Risk ' + riskPct.toFixed(2) + '% of account', 'So small that commissions, slippage and your own time dominate the outcome. Fine for testing a new setup.');
      else add('pass', 'Risk ' + riskPct.toFixed(2) + '% of account', U.money(risk) + ' at risk on a ' + U.money(eq) + ' account — inside the 1-2% professional norm.');
    }
    var notional = plan.entry * plan.qty;
    if (notional > eq) add('fail', 'Position exceeds buying power', U.money(notional) + ' of stock on ' + U.money(eq) + ' of equity. This trainer models a cash account: no margin, no leverage.');
    else if (notional > eq * 0.9) add('warn', 'Position is ' + (notional / eq * 100).toFixed(0) + '% of the account', 'Nearly all-in on one idea. One gap against you and there is nothing left to trade with.');

    if (plan.stop && plan.target) {
      var rr = Math.abs(plan.target - plan.entry) / Math.abs(plan.entry - plan.stop);
      var be = 100 / (1 + rr);
      if (rr < 1) add('fail', 'Reward:risk ' + rr.toFixed(2) + ':1', 'You need to be right ' + be.toFixed(0) + '% of the time just to break even before costs.');
      else if (rr < 1.5) add('warn', 'Reward:risk ' + rr.toFixed(2) + ':1', 'Break-even win rate ' + be.toFixed(0) + '%. Thin margin for error.');
      else add('pass', 'Reward:risk ' + rr.toFixed(2) + ':1', 'Break-even win rate is only ' + be.toFixed(0) + '% — the maths is working for you rather than against you.');
    }

    // --- context / structure ---
    if (ctx) {
      var t = ctx.st && ctx.st.trend;
      if (t) {
        if (t.dir === 0) add('warn', 'Structure: ' + t.label, t.why.join(' · '));
        else if (t.dir === side) add('pass', 'Structure: ' + t.label, 'Aligned with your direction. ' + t.why.join(' · '));
        else add('warn', 'Structure: ' + t.label, 'You are trading against the prevailing structure. That is a valid reversal trade only if you have a reversal signal. ' + t.why.join(' · '));
      }
      if (ctx.snap && ctx.snap.atr && plan.stop) {
        var atrMult = Math.abs(plan.entry - plan.stop) / ctx.snap.atr;
        if (atrMult < 0.5) add('warn', 'Stop is ' + atrMult.toFixed(2) + '× ATR', 'One average bar on this chart is ' + ctx.snap.atr.toFixed(2) + '. Your stop is inside the noise band.');
      }
      var lvl = ctx.st ? TT.struct.nearestLevel(ctx.st.levels, plan.entry, side) : null;
      if (lvl && ctx.snap && ctx.snap.atr) {
        var dist = Math.abs(lvl.price - plan.entry) / ctx.snap.atr;
        if (dist < 0.8) add('warn', 'Level in the way at ' + lvl.price.toFixed(2), 'A ' + lvl.side + ' zone with ' + lvl.touches + ' touches sits only ' + dist.toFixed(2) + '× ATR ahead. Either target it or wait for the break.');
      }
      // strategy-specific checks
      var strat = TT.strategyById(plan.strategyId);
      (strat.checklist || []).forEach(function (c) {
        var res;
        try { res = c.test(ctx); } catch (e) { res = { state: 'na', detail: 'Check unavailable.' }; }
        add(res.state === 'na' ? 'na' : res.state, c.label, res.detail, 'strategy');
      });
    }

    return {
      items: items, blockers: blockers, warnings: warns, strategyFails: stratFails,
      strategyName: TT.strategyById(plan.strategyId).name,
      riskDollars: risk, riskPct: riskPct, notional: notional,
      rr: (plan.stop && plan.target) ? Math.abs(plan.target - plan.entry) / Math.abs(plan.entry - plan.stop) : null,
      // 'blocked' = a mechanical error (no stop, wrong side, no buying power).
      // 'offbook' = mechanically fine but it is not the setup your playbook describes.
      verdict: blockers ? 'blocked' : stratFails ? 'offbook' : warns ? 'caution' : 'clean'
    };
  };

  /* ---------------- POST-TRADE ---------------- */
  R.postTrade = function (sim, trade) {
    var side = trade.side === 'long' ? 1 : -1;
    // Grade the DECISION at the price you saw, not the fill you got. Execution cost is
    // real and is reported separately below — but it is not an analysis error.
    var decisionPrice = trade.quoted != null ? trade.quoted : trade.entry;
    var ctx = R.context(sim, trade.entryIdx, side, decisionPrice, trade.stop, trade.target);
    var strat = TT.strategyById(trade.strategy);
    var sections = [], score = 0, maxScore = 0;

    function section(title, weight, items, note) {
      var got = 0, tot = 0;
      items.forEach(function (it) {
        if (it.state === 'na') return;
        tot += 1;
        got += it.state === 'pass' ? 1 : it.state === 'warn' ? 0.5 : 0;
      });
      var pct = tot ? got / tot : null;
      if (pct != null) { score += pct * weight; maxScore += weight; }
      sections.push({ title: title, items: items, pct: pct, weight: weight, note: note });
    }

    // ---- 1. Entry (strategy adherence + location) ----
    var entryItems = [];
    if (ctx) {
      (strat.checklist || []).forEach(function (c) {
        var res;
        try { res = c.test(ctx); } catch (e) { res = { state: 'na', detail: 'Check unavailable.' }; }
        entryItems.push({ state: res.state, label: c.label, detail: res.detail });
      });
      if (ctx.snap && ctx.snap.atr) {
        var ext = (trade.entry - (ctx.snap.ema20 || trade.entry)) * side / ctx.snap.atr;
        entryItems.push(ext > 2
          ? { state: 'fail', label: 'Entry location vs the mean', detail: 'You entered ' + ext.toFixed(1) + '× ATR beyond the 20 EMA. Chasing extension is the most common reason a correct directional idea still loses money.' }
          : { state: 'pass', label: 'Entry location vs the mean', detail: 'Entry sat ' + ext.toFixed(1) + '× ATR from the 20 EMA — a reasonable location rather than a chase.' });
      }
    } else entryItems.push({ state: 'na', label: 'Entry context', detail: 'Not enough bars before the entry to reconstruct context.' });
    section('Entry quality — ' + strat.name, 34, entryItems, 'Graded against the ' + strat.name + ' playbook as it looked at your entry bar.');

    // ---- 2. Stop placement ----
    var stopItems = [];
    if (!trade.stop) {
      stopItems.push({ state: 'fail', label: 'Stop loss attached', detail: 'No stop was set. Everything that follows is luck, not process.' });
    } else {
      stopItems.push({ state: 'pass', label: 'Stop loss attached', detail: 'Risk was defined before the trade: ' + U.money(trade.riskPerShare) + ' per share.' });
      if (ctx) {
        var r1 = TT.checks.stopVsAtr(ctx); stopItems.push({ state: r1.state, label: 'Stop vs volatility (ATR)', detail: r1.detail });
        var r2 = TT.checks.stopBeyondStructure(ctx); stopItems.push({ state: r2.state, label: 'Stop vs structure', detail: r2.detail });
      }
      // MAE — how close did it come before it worked?
      if (trade.maeR != null) {
        if (trade.reason === 'Stop loss') {
          stopItems.push({ state: 'na', label: 'Heat taken (MAE)', detail: 'The trade went to the stop. Maximum adverse excursion was 1.0R by definition.' });
        } else if (trade.maeR > 0.9) {
          stopItems.push({ state: 'warn', label: 'Heat taken (MAE)', detail: 'Price came within ' + ((1 - trade.maeR) * 100).toFixed(0) + '% of your stop (MAE ' + trade.maeR.toFixed(2) + 'R) before working. A near-miss like this is a sign the entry was early, not that the stop was wrong.' });
        } else if (trade.maeR < 0.35) {
          stopItems.push({ state: 'pass', label: 'Heat taken (MAE)', detail: 'Maximum adverse excursion was only ' + trade.maeR.toFixed(2) + 'R. The trade worked almost immediately — that is what a well-timed entry looks like, and it means a tighter stop would also have survived.' });
        } else {
          stopItems.push({ state: 'pass', label: 'Heat taken (MAE)', detail: 'Maximum adverse excursion ' + trade.maeR.toFixed(2) + 'R — normal noise, stop was correctly placed outside it.' });
        }
      }
      // stop-then-reverse detection
      if (trade.reason === 'Stop loss') {
        var after = sim.bars.slice(trade.exitIdx + 1, trade.exitIdx + 21);
        if (after.length) {
          var favourable = 0;
          after.forEach(function (b) { var mv = (side === 1 ? b.h - trade.entry : trade.entry - b.l); if (mv > favourable) favourable = mv; });
          var fR = trade.riskPerShare ? favourable / trade.riskPerShare : null;
          if (fR != null && fR > 1.5) stopItems.push({ state: 'warn', label: 'Stopped, then it ran', detail: 'After stopping you out, price moved ' + fR.toFixed(1) + 'R in your original direction within ' + after.length + ' bars. The DIRECTION was right and the stop was too tight or the entry too early. Do not conclude the idea was wrong — conclude the location was.' });
        }
      }
    }
    section('Stop-loss placement', 20, stopItems, 'A stop belongs where the idea is proven wrong — not at a dollar amount that feels comfortable.');

    // ---- 3. Target, exit and what you left behind ----
    var exitItems = [];
    if (trade.plannedR != null) {
      exitItems.push(trade.plannedR >= 1.5
        ? { state: 'pass', label: 'Planned reward:risk', detail: 'Planned ' + trade.plannedR.toFixed(2) + ':1 (break-even win rate ' + (100 / (1 + trade.plannedR)).toFixed(0) + '%).' }
        : { state: 'fail', label: 'Planned reward:risk', detail: 'Planned only ' + trade.plannedR.toFixed(2) + ':1. You needed a ' + (100 / (1 + trade.plannedR)).toFixed(0) + '% win rate to break even before costs.' });
    } else exitItems.push({ state: 'warn', label: 'Planned reward:risk', detail: 'No target was set, so the trade had no defined payoff to justify the risk.' });

    if (trade.mfeR != null && trade.realizedR != null) {
      var capture = trade.mfeR > 0 ? trade.realizedR / trade.mfeR : null;
      if (trade.mfeR >= 1 && trade.realizedR <= 0) {
        exitItems.push({ state: 'fail', label: 'Give-back', detail: 'The trade was up ' + trade.mfeR.toFixed(2) + 'R at its best and you finished at ' + trade.realizedR.toFixed(2) + 'R. Letting a 1R+ winner become a loser is a management failure, not a market failure. A stop moved to break-even at +1R turns this into a scratch.' });
      } else if (capture != null && capture < 0.35 && trade.mfeR > 1.2) {
        exitItems.push({ state: 'warn', label: 'Profit capture', detail: 'You captured ' + (capture * 100).toFixed(0) + '% of the favourable move (took ' + trade.realizedR.toFixed(2) + 'R out of ' + trade.mfeR.toFixed(2) + 'R available). Exiting early feels safe and quietly destroys expectancy.' });
      } else if (capture != null) {
        exitItems.push({ state: 'pass', label: 'Profit capture', detail: 'Captured ' + (capture * 100).toFixed(0) + '% of the maximum favourable excursion (' + trade.realizedR.toFixed(2) + 'R of ' + trade.mfeR.toFixed(2) + 'R).' });
      }
    }
    // costs: on tight stops, the spread is a big share of the risk — worth seeing explicitly
    if (trade.slipCost != null && trade.riskPerShare) {
      var slipShare = trade.slipCost / trade.riskPerShare * 100;
      if (slipShare > 15) exitItems.push({ state: 'warn', label: 'Entry slippage vs your risk',
        detail: 'Modelled slippage cost ' + U.money(trade.slipCost) + ' per share — that is ' + slipShare.toFixed(0) + '% of your ' + U.money(trade.riskPerShare) + ' risk per share, taken before the trade even started. Very tight stops on high-priced stocks hand a large share of the edge to execution costs; this is one of the strongest arguments against high-frequency discretionary trading on a small account.' });
      else exitItems.push({ state: 'pass', label: 'Entry slippage vs your risk',
        detail: 'Modelled slippage was ' + U.money(trade.slipCost) + ' per share, ' + slipShare.toFixed(0) + '% of risk per share — a sensible ratio.' });
    }
    exitItems.push({
      state: trade.reason === 'Stop loss' ? 'pass' : trade.reason === 'Take profit' ? 'pass' : 'warn',
      label: 'Exit was ' + (trade.reason || 'manual'),
      detail: trade.reason === 'Stop loss' ? 'You let the stop do its job. Taking the planned loss without interfering is a skill most traders never build.'
        : trade.reason === 'Take profit' ? 'The pre-planned target filled. Plan followed.'
        : trade.reason && trade.reason.indexOf('session end') >= 0 ? 'Closed at the bell. Day traders go home flat by design — overnight gaps are risk you cannot manage while asleep.'
        : 'Discretionary exit. Sometimes right, but it is not measurable and it cannot be repeated deliberately. Prefer a rule.'
    });

    // what happened after you exited
    var post = sim.bars.slice(trade.exitIdx + 1, trade.exitIdx + 21);
    if (post.length && trade.riskPerShare) {
      var bestAfter = 0, worstAfter = 0;
      post.forEach(function (b) {
        var up = (side === 1 ? b.h - trade.exit : trade.exit - b.l);
        var dn = (side === 1 ? trade.exit - b.l : b.h - trade.exit);
        if (up > bestAfter) bestAfter = up;
        if (dn > worstAfter) worstAfter = dn;
      });
      var bR = bestAfter / trade.riskPerShare, wR = worstAfter / trade.riskPerShare;
      exitItems.push({
        state: 'na', label: 'What happened next (hindsight)',
        detail: 'In the ' + post.length + ' bars after your exit, price offered another ' + bR.toFixed(2) + 'R in your direction and went ' + wR.toFixed(2) + 'R against it. ' +
          (bR > 1.5 && trade.reason !== 'Stop loss' ? 'There was more in the move — consider scaling out instead of a single full exit. ' : '') +
          (wR > 1.5 ? 'Waiting longer would have given a lot back — your exit protected real gains. ' : '') +
          'Hindsight is a teaching tool, not a scoring tool: you could not see these bars when you decided.'
      });
    }
    section('Target, exit and trade management', 26, exitItems, 'Exits decide how much of your edge you actually keep.');

    // ---- 4. Risk & sizing ----
    var sizeItems = [];
    if (trade.riskPctOfEquity != null) {
      var rp = trade.riskPctOfEquity;
      sizeItems.push(rp > 5 ? { state: 'fail', label: 'Risk per trade', detail: 'Risked ' + rp.toFixed(2) + '% of the account (' + U.money(trade.riskDollars) + '). At this size a normal 6-trade losing streak costs roughly ' + (100 - Math.pow(1 - rp / 100, 6) * 100).toFixed(0) + '% of the account.' }
        : rp > 2 ? { state: 'warn', label: 'Risk per trade', detail: 'Risked ' + rp.toFixed(2) + '% — above the 1-2% professional norm.' }
        : { state: 'pass', label: 'Risk per trade', detail: 'Risked ' + rp.toFixed(2) + '% (' + U.money(trade.riskDollars) + '). Survivable sizing: you can be wrong many times in a row and still be in business.' });
    }
    if (trade.notional && sim.startBalance) {
      var conc = trade.notional / (sim.startBalance) * 100;
      sizeItems.push(conc > 100 ? { state: 'warn', label: 'Position concentration', detail: 'Position notional was ' + conc.toFixed(0) + '% of starting equity.' }
        : { state: 'pass', label: 'Position concentration', detail: U.money(trade.notional) + ' of stock (' + conc.toFixed(0) + '% of starting equity).' });
    }
    if (trade.barsHeld === 0) sizeItems.push({ state: 'warn', label: 'Holding time', detail: 'In and out on the same bar. On a small account, round-trip costs and spread make same-bar scalping a losing game unless the edge is very specific.' });
    section('Risk and position sizing', 20, sizeItems, 'Sizing is the only variable you fully control. Get it wrong and a good strategy still fails.');

    // ---- scoring ----
    var pct = maxScore ? Math.round(score / maxScore * 100) : 0;
    // A weighted average can hide a single serious error behind several easy passes.
    // Any hard failure caps the grade, and trading with no stop caps it hardest.
    var failCount = 0, noStop = false;
    sections.forEach(function (sec) {
      sec.items.forEach(function (it) {
        if (it.state !== 'fail') return;
        failCount++;
        if (/Stop loss attached/.test(it.label)) noStop = true;
      });
    });
    var cap = noStop ? 45 : failCount >= 3 ? 58 : failCount === 2 ? 70 : failCount === 1 ? 84 : 100;
    pct = Math.min(pct, cap);
    var grade = pct >= 88 ? 'A' : pct >= 76 ? 'B' : pct >= 62 ? 'C' : pct >= 48 ? 'D' : 'F';

    // ---- top actionable takeaways ----
    var fails = [], warnsList = [];
    sections.forEach(function (s) {
      s.items.forEach(function (it) {
        if (it.state === 'fail') fails.push(it.label + ' — ' + it.detail);
        else if (it.state === 'warn') warnsList.push(it.label + ' — ' + it.detail);
      });
    });
    var takeaways = fails.concat(warnsList).slice(0, 3);
    if (!takeaways.length) takeaways = ['Process was clean on every checked dimension. Repeat this exact sequence — the outcome of one trade matters far less than whether the process is repeatable.'];

    return {
      trade: trade, strategy: strat, sections: sections, score: pct, grade: grade,
      failedChecks: failCount, capped: cap < 100,
      takeaways: takeaways,
      processVsOutcome: R.processVsOutcome(pct, trade.pnl)
    };
  };

  /* The lesson traders resist hardest: outcome and process are different axes. */
  R.processVsOutcome = function (score, pnl) {
    var good = score >= 70, won = pnl > 0;
    if (good && won) return { label: 'Good process, good outcome', note: 'The ideal quadrant. Log it and look for the same conditions again.' };
    if (good && !won) return { label: 'Good process, bad outcome', note: 'This is a normal, unavoidable trade. Any edge loses regularly. Changing a sound process because of one loss is how traders destroy an edge they already had.' };
    if (!good && won) return { label: 'Bad process, good outcome', note: 'The most dangerous quadrant. The market just paid you for a mistake, and that is exactly how bad habits get reinforced. Review the failed checks as if you had lost.' };
    return { label: 'Bad process, bad outcome', note: 'The cheapest lesson available: the checks flagged the problems before the market did. Fix the flagged items first.' };
  };

  /* Session-level review across all trades taken. */
  R.sessionReview = function (sim) {
    var s = sim.stats(), notes = [];
    var t = sim.trades;
    if (!t.length) return { stats: s, notes: ['No trades yet. Patience is a position — but so is never pulling the trigger. Use the replay to find setups that match your playbook.'] };

    if (s.winRate < 40 && s.expectancyR != null && s.expectancyR > 0)
      notes.push('Win rate is ' + s.winRate.toFixed(0) + '% yet expectancy is positive (' + s.expectancyR.toFixed(2) + 'R per trade). That is a trend-following profile: most trades lose small, a few pay for everything. The danger is quitting during the normal losing streaks.');
    if (s.winRate > 65 && s.expectancyR != null && s.expectancyR < 0)
      notes.push('You win ' + s.winRate.toFixed(0) + '% of trades and still lose money. Your losers are bigger than your winners — classic "cut winners, let losers run". Fix the exits before touching the entries.');
    if (s.payoff != null && s.payoff < 1 && s.winRate < 50)
      notes.push('Payoff ratio ' + s.payoff.toFixed(2) + ' with a sub-50% win rate is mathematically unprofitable. Either the targets are too close or the stops are too far.');
    if (s.avgRiskPct > 2.5) notes.push('Average risk per trade is ' + s.avgRiskPct.toFixed(1) + '% of equity. Cut it to 1% and the same trade sequence produces a much shallower drawdown curve.');
    if (s.maxDD > 20) notes.push('Maximum drawdown hit ' + s.maxDD.toFixed(1) + '%. Recovering from a ' + s.maxDD.toFixed(0) + '% drawdown requires a ' + (100 / (1 - s.maxDD / 100) - 100).toFixed(0) + '% gain — losses are not symmetric.');

    var stoppedCount = t.filter(function (x) { return x.reason === 'Stop loss'; }).length;
    var noStop = t.filter(function (x) { return !x.stop; }).length;
    if (noStop) notes.push(noStop + ' of ' + t.length + ' trades were taken with NO stop loss. That is the one habit that ends accounts.');
    var giveBacks = t.filter(function (x) { return x.mfeR != null && x.mfeR >= 1 && x.realizedR != null && x.realizedR <= 0; }).length;
    if (giveBacks) notes.push(giveBacks + ' trade(s) were up 1R or more and finished at or below break-even. A rule such as "move the stop to break-even at +1R" would have changed those outcomes.');
    var earlyExits = t.filter(function (x) { return x.mfeR != null && x.mfeR > 2 && x.realizedR != null && x.realizedR < x.mfeR * 0.4; }).length;
    if (earlyExits >= 2) notes.push(earlyExits + ' trades were exited before capturing 40% of the available move. Consider scaling out in thirds instead of a single exit decision.');
    var overtrade = sim.ds && sim.ds.intraday && t.length > 6;
    if (overtrade) notes.push(t.length + ' trades in one session is a lot for a ' + TT.util.money(sim.startBalance) + ' account. Frequency multiplies costs and mistakes far faster than it multiplies edge.');
    if (stoppedCount === t.length && t.length >= 3) notes.push('Every trade hit the stop. Stop back and check the regime: are you taking continuation setups in a range, or fading a trend?');
    if (!notes.length) notes.push('Nothing structurally wrong in this sample. Keep the sample growing — 20+ trades is where statistics start to mean anything, and 100+ is where they start to be reliable.');
    return { stats: s, notes: notes };
  };
})(window);
