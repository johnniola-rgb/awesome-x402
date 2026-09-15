/* app-trade.js — order ticket, live pre-trade coach, position management,
   blotter, performance panel and the post-trade review modal. Simulated only. */
(function (w) {
  'use strict';
  var TT = w.TT, U = TT.util, $ = TT.dom.$, el = TT.dom.el;
  TT.ui = TT.ui || {};

  var ticket = {
    side: 'long', qty: 0, stop: null, target: null, useRisk: true,
    orderType: 'market', limitPrice: null, note: '', touched: false
  };
  TT.ui.ticket = ticket;

  /* A new dataset means a new idea — drop any hand-typed prices so the ticket
     re-populates with suggestions drawn from the new chart's structure. */
  TT.ui.resetTicket = function () {
    ticket.touched = false; ticket.limitPrice = null; ticket.note = '';
    ticket.stop = null; ticket.target = null; ticket.orderType = 'market';
  };

  function S() { return TT.app.S; }

  /* Suggest a stop/target from real structure + ATR, so beginners see what
     "a stop at a level" looks like instead of guessing a dollar amount. */
  function suggest() {
    var st = S().analysis, sim = S().sim;
    if (!st || !st.snap) return null;
    var price = sim.price(), atr = st.snap.atr || price * 0.01, side = ticket.side === 'long' ? 1 : -1;
    var stop, why = 'ATR-based';
    var sw = st.struct && st.struct.swings;
    if (sw) {
      if (side === 1) {
        var lows = sw.lows.filter(function (l) { return l.price < price; });
        if (lows.length) { stop = lows[lows.length - 1].price - atr * 0.2; why = 'below the last swing low'; }
      } else {
        var highs = sw.highs.filter(function (h) { return h.price > price; });
        if (highs.length) { stop = highs[highs.length - 1].price + atr * 0.2; why = 'above the last swing high'; }
      }
    }
    if (stop == null || Math.abs(price - stop) > atr * 4 || Math.abs(price - stop) < atr * 0.4) {
      stop = price - side * atr * 1.5; why = '1.5× ATR (no usable swing nearby)';
    }
    stop = U.round(stop, 2);
    var risk = Math.abs(price - stop);
    // round the target AWAY from entry so the displayed plan is never a hair under 2R
    var raw = price + side * risk * 2;
    var target = side === 1 ? Math.ceil(raw * 100) / 100 : Math.floor(raw * 100) / 100;
    return { price: price, stop: stop, target: target, why: why, atr: atr };
  }

  TT.ui.renderTicket = function () {
    var sim = S().sim, st = S().settings;
    if (!sim) return;
    var price = sim.price();
    var sug = suggest();
    if (!ticket.touched && sug) { ticket.stop = sug.stop; ticket.target = sug.target; }

    var sizing = (ticket.stop != null) ? sim.suggestSize(price, ticket.stop, st.riskPct) : null;
    if (ticket.useRisk && sizing) ticket.qty = sizing.qty;

    var box = $('#ticket');
    box.innerHTML = '';

    // side
    var seg = el('div', { class: 'seg' });
    ['long', 'short'].forEach(function (sd) {
      seg.appendChild(el('button', {
        class: ticket.side === sd ? 'active' : '',
        onclick: function () { ticket.side = sd; ticket.touched = false; TT.ui.renderTicket(); TT.ui.updateCoach(); }
      }, sd === 'long' ? 'Buy / Long' : 'Sell short'));
    });
    box.appendChild(seg);

    box.appendChild(el('div', { class: 'tiny dim', style: 'margin:8px 0 6px' },
      'Last price <b class="mono">' + price.toFixed(2) + '</b>' + (sug ? ' · ATR ' + sug.atr.toFixed(2) : '')));

    function numField(label, value, onInput, hint) {
      var wrap = el('label', { class: 'field' }, '<span>' + label + '</span>');
      var inp = el('input', { type: 'number', step: '0.01', value: value == null ? '' : value });
      inp.addEventListener('input', function () {
        ticket.touched = true;
        onInput(inp.value === '' ? null : parseFloat(inp.value));
        TT.ui.updateCoach();
      });
      wrap.appendChild(inp);
      if (hint) wrap.appendChild(el('div', { class: 'tiny dim' }, hint));
      return wrap;
    }

    // order type
    var typeSeg = el('div', { class: 'seg', style: 'margin-bottom:9px' });
    [['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop entry']].forEach(function (t) {
      typeSeg.appendChild(el('button', {
        class: ticket.orderType === t[0] ? 'active' : '',
        onclick: function () { ticket.orderType = t[0]; TT.ui.renderTicket(); }
      }, t[1]));
    });
    box.appendChild(typeSeg);
    if (ticket.orderType !== 'market') {
      box.appendChild(numField(ticket.orderType === 'limit' ? 'Limit price' : 'Stop trigger price',
        ticket.limitPrice, function (v) { ticket.limitPrice = v; },
        ticket.orderType === 'limit' ? 'Fills only at this price or better.' : 'Becomes a market order when touched — used for breakout entries.'));
    }

    box.appendChild(numField('Stop loss', ticket.stop, function (v) { ticket.stop = v; TT.ui.renderTicket(); },
      sug ? 'Suggested ' + sug.stop.toFixed(2) + ' — ' + sug.why : ''));
    box.appendChild(numField('Take profit', ticket.target, function (v) { ticket.target = v; TT.ui.renderTicket(); },
      sug ? 'Suggested ' + sug.target.toFixed(2) + ' (2R)' : ''));

    // sizing
    var riskToggle = el('label', { class: 'toggle', style: 'margin:4px 0 8px' });
    var cb = el('input', { type: 'checkbox' });
    cb.checked = ticket.useRisk;
    cb.addEventListener('change', function () { ticket.useRisk = cb.checked; TT.ui.renderTicket(); TT.ui.updateCoach(); });
    riskToggle.appendChild(cb);
    riskToggle.appendChild(el('span', {}, 'Size from risk (' + st.riskPct + '% of equity)'));
    box.appendChild(riskToggle);

    var qtyWrap = el('label', { class: 'field' }, '<span>Shares</span>');
    var qtyInput = el('input', { type: 'number', step: '1', min: '0', value: ticket.qty || 0 });
    qtyInput.disabled = ticket.useRisk;
    qtyInput.addEventListener('input', function () { ticket.qty = parseInt(qtyInput.value, 10) || 0; TT.ui.updateCoach(); });
    qtyWrap.appendChild(qtyInput);
    box.appendChild(qtyWrap);

    if (sizing) {
      var lines = [
        'Risk/share ' + U.money(sizing.perShareRisk) + ' · position ' + U.money(sizing.notional),
        'Risking ' + U.money(sizing.riskDollars) + ' (' + sizing.riskPctActual.toFixed(2) + '% of equity)'
      ];
      if (sizing.capped) lines.push('⚠ ' + st.riskPct + '% risk wants ' + sizing.riskQty + ' shares but buying power allows ' + sizing.affordableQty + '. Size capped — on a small account this is normal and it is why cheaper stocks or tighter structural stops matter.');
      box.appendChild(el('div', { class: 'tiny ' + (sizing.capped ? 'muted' : 'dim'), style: 'margin:-4px 0 9px' }, lines.join('<br>')));
    }

    var noteWrap = el('label', { class: 'field' }, '<span>Why this trade? (journaled)</span>');
    var note = el('textarea', { rows: '2', placeholder: 'e.g. pullback to 20 EMA after BOS, stop below swing low' }, '');
    note.value = ticket.note;
    note.addEventListener('input', function () { ticket.note = note.value; });
    noteWrap.appendChild(note);
    box.appendChild(noteWrap);

    var btns = el('div', { class: 'btn-group' });
    var submit = el('button', {
      class: 'btn ' + (ticket.side === 'long' ? 'buy' : 'sell'),
      onclick: submitOrder
    }, (ticket.orderType === 'market' ? 'Submit ' : 'Place ') + (ticket.side === 'long' ? 'BUY' : 'SHORT') + ' · ' + (ticket.qty || 0) + ' sh');
    btns.appendChild(submit);
    btns.appendChild(el('button', { class: 'btn sm ghost', onclick: function () {
      ticket.touched = false; ticket.note = ''; ticket.limitPrice = null; TT.ui.renderTicket(); TT.ui.updateCoach();
    } }, 'Reset'));
    box.appendChild(btns);
    box.appendChild(el('p', { class: 'tiny dim', style: 'margin:8px 0 0' },
      'Paper order. Nothing is routed to any broker or exchange.'));
  };

  function submitOrder() {
    var sim = S().sim;
    var plan = planFromTicket();
    var pre = TT.review.preTrade(sim, plan);
    S().lastPre = pre;
    if (pre.blockers) {
      var first = pre.items.filter(function (i) { return i.state === 'fail' && i.kind !== 'strategy'; })[0];
      TT.toast('Blocked: ' + first.label + '. ' + first.detail, 'bad', 7000);
      TT.ui.updateCoach();
      return;
    }
    var meta = {
      strategy: S().settings.strategy, note: ticket.note,
      snapshot: S().analysis ? {
        trend: S().analysis.struct && S().analysis.struct.trend.label,
        atr: S().analysis.snap.atr, rsi: S().analysis.snap.rsi,
        adx: S().analysis.snap.adx, rvol: S().analysis.snap.rvol,
        vwap: S().analysis.snap.vwap
      } : null,
      preTrade: { verdict: pre.verdict, warnings: pre.warnings, strategyFails: pre.strategyFails }
    };
    var res;
    if (ticket.orderType === 'market') {
      res = sim.marketOrder(ticket.side, plan.qty, ticket.stop, ticket.target, meta);
      if (!res.ok) { TT.toast(res.msg, 'bad', 6000); return; }
      TT.toast((ticket.side === 'long' ? 'Bought ' : 'Shorted ') + plan.qty + ' @ ' + res.price.toFixed(2), 'good');
    } else {
      if (!ticket.limitPrice) { TT.toast('Enter a price for this order type.', 'bad'); return; }
      sim.pendingOrder({
        type: ticket.orderType, side: ticket.side, qty: plan.qty, price: ticket.limitPrice,
        stop: ticket.stop, target: ticket.target, meta: meta
      });
      TT.toast('Working ' + ticket.orderType + ' order placed at ' + ticket.limitPrice.toFixed(2) + '. Advance bars to see if it fills.', 'good', 5000);
    }
    ticket.note = '';
    TT.app.renderAll();
  }

  function planFromTicket() {
    var sim = S().sim;
    var entry = ticket.orderType === 'market' ? sim.price() : (ticket.limitPrice || sim.price());
    return {
      side: ticket.side, qty: ticket.qty, entry: entry, stop: ticket.stop, target: ticket.target,
      strategyId: S().settings.strategy, riskPct: S().settings.riskPct
    };
  }

  /* ---------------- live pre-trade coach ---------------- */
  TT.ui.updateCoach = function () {
    var sim = S().sim;
    if (!sim || !S().analysis) return;
    var pre = TT.review.preTrade(sim, planFromTicket());
    S().lastPre = pre;
    var badge = $('#coach-verdict');
    var map = {
      blocked: ['bad', '✕ Blocked'], offbook: ['warn', '! Off-playbook'],
      caution: ['warn', '! Caution'], clean: ['good', '✓ Clean setup']
    };
    var m = map[pre.verdict];
    badge.className = 'chip ' + m[0];
    badge.textContent = m[1];

    var head = '';
    if (pre.rr != null) {
      head = '<div class="row tight" style="margin-bottom:8px">' +
        '<span class="chip">R:R ' + pre.rr.toFixed(2) + ':1</span>' +
        '<span class="chip">Risk ' + (pre.riskPct != null ? pre.riskPct.toFixed(2) + '%' : '—') + '</span>' +
        '<span class="chip">' + U.money(pre.riskDollars || 0) + ' at risk</span>' +
        '<span class="chip">BE win rate ' + (100 / (1 + pre.rr)).toFixed(0) + '%</span></div>';
    }
    var mech = pre.items.filter(function (i) { return i.kind !== 'strategy'; });
    var strat = pre.items.filter(function (i) { return i.kind === 'strategy'; });
    function row(i) {
      return '<div class="coach-item ' + TT.review.stateClass(i.state) + '"><span class="ic">' + TT.review.stateIcon(i.state) + '</span>' +
        '<div><strong>' + U.esc(i.label) + '</strong><div class="tiny muted">' + U.esc(i.detail) + '</div></div></div>';
    }
    $('#coach-body').innerHTML = head + mech.map(row).join('') +
      (strat.length ? '<div class="tiny dim" style="margin:10px 0 2px;text-transform:uppercase;letter-spacing:.07em">' + U.esc(pre.strategyName) + ' checklist</div>' + strat.map(row).join('') : '');
  };

  /* ---------------- open position ---------------- */
  TT.ui.renderPosition = function () {
    var sim = S().sim, p = sim.position, body = $('#pos-body');
    if (!p) {
      body.innerHTML = '<p class="muted small">Flat — no open position. ' +
        (sim.trades.length ? 'Being flat is a position: it is the one with zero risk.' : 'Use the ticket to open a simulated position.') + '</p>';
      $('#pos-note').textContent = '';
      return;
    }
    var px = sim.price(), un = sim.unrealized(), dir = p.side === 'long' ? 1 : -1;
    var rPer = p.initialStop ? Math.abs(p.avg - p.initialStop) : null;
    var rNow = rPer ? ((px - p.avg) * dir) / rPer : null;
    $('#pos-note').textContent = p.side.toUpperCase() + ' ' + p.qty + ' @ ' + p.avg.toFixed(2);
    body.innerHTML =
      '<div class="grid cards-4" style="margin-bottom:10px">' +
      stat('Unrealised', U.signed(un), un >= 0 ? 'up' : 'dn') +
      stat('In R', rNow != null ? (rNow >= 0 ? '+' : '') + rNow.toFixed(2) + 'R' : '—', rNow >= 0 ? 'up' : 'dn') +
      stat('Stop', p.stop ? p.stop.toFixed(2) : 'NONE', p.stop ? '' : 'dn') +
      stat('Target', p.target ? p.target.toFixed(2) : '—', '') +
      '</div>';
    var row = el('div', { class: 'btn-group' });
    row.appendChild(el('button', { class: 'btn sm', onclick: function () {
      sim.modifyStop(U.round(p.avg, 2));
      TT.toast('Stop moved to break-even. Note the trade-off: you can no longer lose, and you have also made it easier to be shaken out of a winner.', 'warn', 6500);
      TT.app.renderAll();
    } }, 'Stop → break-even'));
    row.appendChild(el('button', { class: 'btn sm', onclick: function () {
      var half = Math.floor(p.qty / 2);
      if (half < 1) return TT.toast('Position too small to scale out.', 'warn');
      var px2 = sim.price();
      var t = sim._close(half, px2, 'Partial exit (scale out)');
      TT.ui.onTradeClosed(t, true);
      TT.app.renderAll();
    } }, 'Scale out ½'));
    row.appendChild(el('button', { class: 'btn sm sell', onclick: function () {
      var t = sim.closeAll('Manual close');
      TT.ui.onTradeClosed(t);
      TT.app.renderAll();
    } }, 'Close position'));
    body.appendChild(row);

    var adj = el('div', { class: 'row tight', style: 'margin-top:10px' });
    ['stop', 'target'].forEach(function (k) {
      var inp = el('input', { type: 'number', step: '0.01', value: p[k] == null ? '' : p[k], style: 'width:110px' });
      inp.addEventListener('change', function () {
        var v = parseFloat(inp.value);
        if (isNaN(v)) return;
        if (k === 'stop') {
          var away = (p.side === 'long' && v < p.stop) || (p.side === 'short' && v > p.stop);
          sim.modifyStop(v);
          if (away) TT.toast('You widened your stop. That converts a planned 1R loss into a larger unplanned one — the single most common way a good trade becomes a bad day.', 'bad', 8000);
        } else sim.modifyTarget(v);
        TT.app.renderAll();
      });
      adj.appendChild(el('span', { class: 'tiny dim' }, k === 'stop' ? 'Adjust stop' : 'Adjust target'));
      adj.appendChild(inp);
    });
    body.appendChild(adj);
  };

  function stat(k, v, cls) {
    return '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div></div>';
  }

  TT.ui.renderOrders = function () {
    var sim = S().sim, box = $('#orders-body');
    if (!sim.orders.length) { box.innerHTML = '<p class="muted small">No working orders. Limit and stop orders rest here until a bar reaches their price.</p>'; return; }
    box.innerHTML = '<table><thead><tr><th>Type</th><th>Side</th><th>Qty</th><th>Price</th><th>Stop</th><th>Target</th><th></th></tr></thead><tbody>' +
      sim.orders.map(function (o) {
        return '<tr><td>' + o.type + '</td><td class="' + (o.side === 'long' ? 'up' : 'dn') + '">' + o.side + '</td><td>' + o.qty +
          '</td><td>' + o.price.toFixed(2) + '</td><td>' + (o.stop ? o.stop.toFixed(2) : '—') + '</td><td>' + (o.target ? o.target.toFixed(2) : '—') +
          '</td><td class="act"><button class="btn sm ghost" data-cancel="' + o.id + '">Cancel</button></td></tr>';
      }).join('') + '</tbody></table>';
    TT.dom.$$('[data-cancel]', box).forEach(function (b) {
      b.addEventListener('click', function () { sim.cancelOrder(b.getAttribute('data-cancel')); TT.app.renderAll(); });
    });
  };

  TT.ui.renderBlotter = function () {
    var sim = S().sim, box = $('#blotter');
    if (!sim.trades.length) {
      box.innerHTML = '<p class="muted small">No closed trades yet this session.</p>';
      return;
    }
    box.innerHTML = '<table><thead><tr><th>#</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>R</th><th>P&amp;L</th><th>MFE/MAE</th><th>Exit reason</th><th></th></tr></thead><tbody>' +
      sim.trades.map(function (t, i) {
        return '<tr><td>' + (i + 1) + '</td><td class="' + (t.side === 'long' ? 'up' : 'dn') + '">' + t.side + '</td><td>' + t.qty +
          '</td><td>' + t.entry.toFixed(2) + '</td><td>' + t.exit.toFixed(2) + '</td><td class="' + (t.realizedR >= 0 ? 'up' : 'dn') + '">' +
          (t.realizedR != null ? t.realizedR.toFixed(2) + 'R' : '—') + '</td><td class="' + (t.pnl >= 0 ? 'up' : 'dn') + '">' + U.signed(t.pnl) +
          '</td><td class="dim">' + (t.mfeR != null ? t.mfeR.toFixed(1) + ' / ' + t.maeR.toFixed(1) : '—') +
          '</td><td class="dim">' + U.esc(t.reason || '') + '</td><td class="act"><button class="btn sm ghost" data-rev="' + t.id + '">Review</button></td></tr>';
      }).join('') + '</tbody></table>';
    TT.dom.$$('[data-rev]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-rev');
        var t = sim.trades.filter(function (x) { return x.id === id; })[0];
        if (t) showReview(TT.review.postTrade(sim, t));
      });
    });
  };

  TT.ui.renderStats = function () {
    var sim = S().sim, st = sim.stats();
    var cards = [
      ['Equity', U.money(st.equity), st.equity >= sim.startBalance ? 'up' : 'dn', 'Started at ' + U.money(sim.startBalance)],
      ['Net P&L', U.signed(st.totalPnl), st.totalPnl >= 0 ? 'up' : 'dn', U.pct(st.totalPnlPct)],
      ['Trades', String(st.trades), '', st.wins + 'W / ' + st.losses + 'L'],
      ['Win rate', st.trades ? st.winRate.toFixed(0) + '%' : '—', '', 'Win rate alone proves nothing'],
      ['Expectancy', st.expectancyR != null ? st.expectancyR.toFixed(2) + 'R' : '—', st.expectancyR > 0 ? 'up' : 'dn', 'Per trade, in risk units'],
      ['Profit factor', st.profitFactor != null && isFinite(st.profitFactor) ? st.profitFactor.toFixed(2) : '—', st.profitFactor > 1 ? 'up' : 'dn', 'Gross win ÷ gross loss'],
      ['Payoff', st.payoff != null ? st.payoff.toFixed(2) : '—', '', 'Avg win ÷ avg loss'],
      ['Max drawdown', st.maxDD.toFixed(1) + '%', st.maxDD > 15 ? 'dn' : '', 'Needs ' + (st.maxDD ? (100 / (1 - st.maxDD / 100) - 100).toFixed(0) : '0') + '% to recover']
    ];
    $('#stats-grid').innerHTML = cards.map(function (c) {
      return '<div class="stat"><div class="k">' + c[0] + '</div><div class="v ' + c[2] + '">' + c[1] + '</div><div class="sub">' + c[3] + '</div></div>';
    }).join('');
  };

  /* ---------------- trade closed → review + journal ---------------- */
  TT.ui.onTradeClosed = function (trade, quiet) {
    if (!trade) return;
    var sim = S().sim;
    var rev = TT.review.postTrade(sim, trade);
    // persist to journal
    var j = TT.store.get('journal', []);
    j.push({
      id: trade.id, at: new Date().toISOString(), symbol: trade.symbol, timeframe: trade.timeframe,
      side: trade.side, qty: trade.qty, entry: trade.entry, exit: trade.exit, stop: trade.stop, target: trade.target,
      pnl: trade.pnl, realizedR: trade.realizedR, plannedR: trade.plannedR, mfeR: trade.mfeR, maeR: trade.maeR,
      reason: trade.reason, barsHeld: trade.barsHeld, strategy: trade.strategy, note: trade.entryNote,
      riskPctOfEquity: trade.riskPctOfEquity, grade: rev.grade, score: rev.score,
      entryTime: trade.entryTime, exitTime: trade.exitTime
    });
    if (j.length > 1000) j = j.slice(-1000);
    TT.store.set('journal', j);

    TT.toast((trade.pnl >= 0 ? 'Closed +' : 'Closed ') + U.money(trade.pnl).replace('$-', '-$') +
      ' · ' + (trade.realizedR != null ? trade.realizedR.toFixed(2) + 'R' : '') + ' · process grade ' + rev.grade,
      trade.pnl >= 0 ? 'good' : 'bad', 5000);
    if (!quiet && S().settings.autoReview) showReview(rev);
  };

  function showReview(rev) {
    var t = rev.trade;
    var gradeCls = rev.grade.toLowerCase();
    var html = '<div class="row" style="align-items:flex-start;gap:14px;margin-bottom:12px">' +
      '<div class="grade ' + gradeCls + '">' + rev.grade + '</div>' +
      '<div><div class="small"><strong>' + U.esc(t.symbol) + ' ' + t.side + ' ' + t.qty + ' sh</strong> · ' +
      U.esc(t.entryTime) + ' → ' + U.esc(t.exitTime) + ' (' + t.barsHeld + ' bars)</div>' +
      '<div class="row tight" style="margin-top:6px">' +
      '<span class="chip ' + (t.pnl >= 0 ? 'good' : 'bad') + '">' + U.signed(t.pnl) + '</span>' +
      '<span class="chip">' + (t.realizedR != null ? t.realizedR.toFixed(2) + 'R' : 'no stop') + '</span>' +
      '<span class="chip">Process score ' + rev.score + '/100</span>' +
      '<span class="chip">' + U.esc(rev.strategy.name) + '</span></div>' +
      '<div class="tiny muted" style="margin-top:6px"><strong>' + U.esc(rev.processVsOutcome.label) + '.</strong> ' + U.esc(rev.processVsOutcome.note) + '</div>' +
      (t.entryNote ? '<div class="tiny dim" style="margin-top:4px">Your note: “' + U.esc(t.entryNote) + '”</div>' : '') +
      '</div></div>';

    html += '<div class="panel tight" style="margin-bottom:12px;background:var(--panel2)"><strong class="small">Top things to fix next time</strong><ol class="small" style="margin:6px 0 0;padding-left:18px">' +
      rev.takeaways.map(function (x) { return '<li style="margin-bottom:5px">' + U.esc(x) + '</li>'; }).join('') + '</ol></div>';

    rev.sections.forEach(function (s) {
      html += '<div style="margin-bottom:12px"><div class="panel-h" style="margin-bottom:4px"><h4 style="margin:0">' + U.esc(s.title) + '</h4>' +
        '<span class="tiny dim">' + (s.pct != null ? Math.round(s.pct * 100) + '%' : 'n/a') + '</span></div>' +
        (s.pct != null ? '<div class="bar-meter"><i style="width:' + (s.pct * 100).toFixed(0) + '%;background:' +
          (s.pct > .75 ? 'var(--up)' : s.pct > .5 ? 'var(--warn)' : 'var(--dn)') + '"></i></div>' : '') +
        '<div class="tiny dim" style="margin:6px 0">' + U.esc(s.note || '') + '</div>' +
        s.items.map(function (i) {
          return '<div class="coach-item ' + TT.review.stateClass(i.state) + '"><span class="ic">' + TT.review.stateIcon(i.state) + '</span>' +
            '<div><strong>' + U.esc(i.label) + '</strong><div class="tiny muted">' + U.esc(i.detail) + '</div></div></div>';
        }).join('') + '</div>';
    });

    html += '<p class="tiny dim">Grades measure adherence to the selected playbook and to standard risk practice on simulated trades. They are educational feedback, not investment advice, and a high grade is not a prediction of profitability.</p>';
    $('#rev-body').innerHTML = html;
    $('#review-modal').hidden = false;
  }
  TT.ui.showReview = showReview;

  TT.ui.showSessionReview = function () {
    var sim = S().sim, r = TT.review.sessionReview(sim), st = r.stats;
    var html = '<h3 style="margin-top:0">Session review — ' + U.esc(S().ds.label) + '</h3>' +
      '<div class="grid cards-3" style="margin-bottom:12px">' +
      stat('Net P&L', U.signed(st.totalPnl), st.totalPnl >= 0 ? 'up' : 'dn') +
      stat('Trades', String(st.trades), '') +
      stat('Expectancy', st.expectancyR != null ? st.expectancyR.toFixed(2) + 'R' : '—', st.expectancyR > 0 ? 'up' : 'dn') +
      '</div>';
    if (sim.trades.length) {
      var grades = sim.trades.map(function (t) { return TT.review.postTrade(sim, t); });
      var avg = U.mean(grades.map(function (g) { return g.score; }));
      html += '<p class="small">Average process score across ' + grades.length + ' trades: <strong>' + avg.toFixed(0) + '/100</strong>. ' +
        'Process is what you control; P&L over a handful of trades is mostly noise.</p>';
    }
    html += '<ul class="small">' + r.notes.map(function (n) { return '<li style="margin-bottom:8px">' + U.esc(n) + '</li>'; }).join('') + '</ul>';
    html += '<div class="row" style="margin-top:12px">' +
      '<button class="btn primary" id="sr-new">Load a new random session</button>' +
      '<button class="btn ghost" id="sr-journal">Open journal</button></div>';
    $('#rev-body').innerHTML = html;
    $('#review-modal').hidden = false;
    var nb = $('#sr-new'), jb = $('#sr-journal');
    if (nb) nb.addEventListener('click', function () {
      $('#review-modal').hidden = true;
      var btn = TT.dom.$$('#sim-setup button').filter(function (b) { return /Random/.test(b.textContent); })[0];
      if (btn) btn.click();
    });
    if (jb) jb.addEventListener('click', function () { $('#review-modal').hidden = true; TT.app.go('journal'); });
  };
})(window);
