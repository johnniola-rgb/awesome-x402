/* app.js — UI wiring for the trainer. Simulation only. */
(function (w) {
  'use strict';
  var TT = w.TT, U = TT.util, $ = TT.dom.$, $$ = TT.dom.$$, el = TT.dom.el;

  var DEFAULT_SETTINGS = {
    startBalance: 2000, riskPct: 1, slippageBps: 1, commission: 0,
    mode: 'swing', tf: '1D', symbol: 'AAPL', sessionDate: null,
    strategy: 'momo-pullback', autoReview: true, blind: true,
    shortingAllowed: true, forceFlatAtSessionEnd: true, stopFirstWhenAmbiguous: true
  };

  var S = {
    settings: Object.assign({}, DEFAULT_SETTINGS, TT.store.get('settings', {})),
    sim: null, chart: null, labChart: null, ds: null,
    overlays: TT.store.get('overlays', ['ema', 'volume']),
    subPane: TT.store.get('subPane', 'volume'),
    structureOn: TT.store.get('structureOn', ['swings']),
    playing: false, timer: null, analysis: null, lastPre: null
  };
  w.__TT_STATE = S;

  function saveSettings() { TT.store.set('settings', S.settings); }

  /* ================= navigation ================= */
  var VIEWS = [
    { id: 'sim', label: '📊 Simulator' },
    { id: 'candles', label: '🕯 Candle Classroom' },
    { id: 'tools', label: '🧰 30 Tools' },
    { id: 'strategies', label: '📘 Strategies' },
    { id: 'structure', label: '🔍 Structure Lab' },
    { id: 'options', label: '⚙️ Options 101' },
    { id: 'learn', label: '🎓 Learn' },
    { id: 'journal', label: '📓 Journal' },
    { id: 'settings', label: '⚙︎ Settings' },
    { id: 'legal', label: '⚖️ Legal' }
  ];

  function buildNav() {
    var nav = $('#nav');
    VIEWS.forEach(function (v) {
      nav.appendChild(el('button', {
        'data-view': v.id,
        onclick: function () { go(v.id); }
      }, v.label));
    });
  }

  function go(id) {
    $$('.view').forEach(function (s) { s.classList.toggle('active', s.id === 'view-' + id); });
    $$('#nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === id); });
    if (id === 'journal') TT.ui.renderJournal();
    if (id === 'structure') TT.ui.renderLab();
    if (w.location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    w.scrollTo(0, 0);
  }
  TT.go = go;

  /* ================= legal gate ================= */
  function initGate() {
    $('#gate-body').innerHTML = TT.legal.gate;
    $('#footer-legal').innerHTML = '<strong>' + TT.legal.shortBanner + '</strong><br>' + TT.legal.footer;
    var accepted = TT.store.get('legalAccepted', false);
    if (!accepted) {
      $('#gate').hidden = false;
      $('#gate-check').addEventListener('change', function (e) { $('#gate-accept').disabled = !e.target.checked; });
      $('#gate-accept').addEventListener('click', function () {
        TT.store.set('legalAccepted', { at: new Date().toISOString() });
        $('#gate').hidden = true;
      });
      $('#gate-legal').addEventListener('click', function (e) {
        e.preventDefault(); $('#gate').hidden = true; go('legal');
        setTimeout(function () { if (!TT.store.get('legalAccepted', false)) $('#gate').hidden = false; }, 30000);
      });
    }
  }

  /* ================= account strip ================= */
  function renderAccount() {
    var sim = S.sim;
    if (!sim) return;
    var eq = sim.equity(), st = sim.stats();
    var open = sim.unrealized();
    var items = [
      ['Equity', U.money(eq), eq >= sim.startBalance ? 'up' : 'dn'],
      ['Realised P&L', U.signed(sim.realized), sim.realized >= 0 ? 'up' : 'dn'],
      ['Open P&L', sim.position ? U.signed(open) : '—', open >= 0 ? 'up' : 'dn'],
      ['Return', U.pct(sim.startBalance ? (eq - sim.startBalance) / sim.startBalance * 100 : 0), eq >= sim.startBalance ? 'up' : 'dn'],
      ['Trades', String(st.trades), ''],
      ['Win rate', st.trades ? st.winRate.toFixed(0) + '%' : '—', ''],
      ['Open risk', sim.position && sim.position.stop ? U.money(sim.openRisk()) : '—', '']
    ];
    $('#acct-strip').innerHTML = items.map(function (i) {
      return '<div><div class="k">' + i[0] + '</div><div class="v ' + i[2] + '">' + i[1] + '</div></div>';
    }).join('');
  }

  /* ================= simulator setup bar ================= */
  function renderSetup() {
    var s = S.settings;
    var box = $('#sim-setup');
    var symbols = TT.data.symbols(s.tf);
    var sessions = s.tf === '1D' ? [] : TT.data.sessions(s.tf, s.symbol);
    box.innerHTML = '';

    function field(label, node) {
      var wrap = el('label', { class: 'field' }, '<span>' + label + '</span>');
      wrap.style.marginBottom = '0';
      wrap.appendChild(node);
      return wrap;
    }
    function select(opts, val, onchange, width) {
      var sel = el('select');
      if (width) sel.style.width = width;
      opts.forEach(function (o) {
        var op = el('option', { value: o.v }, U.esc(o.l));
        if (String(o.v) === String(val)) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () { onchange(sel.value); });
      return sel;
    }

    box.appendChild(field('Mode', select([
      { v: 'swing', l: 'Swing (daily bars)' }, { v: 'day', l: 'Day trading (intraday)' }
    ], s.mode, function (v) {
      s.mode = v;
      s.tf = v === 'swing' ? '1D' : '5m';
      s.sessionDate = null;
      if (v === 'day') { s.symbol = 'SPY'; }
      saveSettings();
      TT.data.ensure(s.tf, function () { renderSetup(); loadDataset(); });
    }, '170px')));

    if (s.mode === 'day') {
      box.appendChild(field('Timeframe', select([
        { v: '5m', l: '5-minute' }, { v: '1m', l: '1-minute (NVDA/TSLA)' }
      ], s.tf, function (v) {
        s.tf = v; s.sessionDate = null; saveSettings();
        TT.data.ensure(v, function () {
          var syms = TT.data.symbols(v);
          if (!syms.some(function (x) { return x.symbol === s.symbol; })) s.symbol = syms[0].symbol;
          renderSetup(); loadDataset();
        });
      }, '130px')));
    }

    box.appendChild(field('Symbol', select(symbols.map(function (x) {
      return { v: x.symbol, l: x.symbol + ' — ' + x.name };
    }), s.symbol, function (v) { s.symbol = v; s.sessionDate = null; saveSettings(); renderSetup(); loadDataset(); }, '220px')));

    if (s.mode === 'day' && sessions.length) {
      box.appendChild(field('Session', select(sessions.slice(2).map(function (d) { return { v: d, l: d }; }),
        s.sessionDate || sessions[sessions.length - 1],
        function (v) { s.sessionDate = v; saveSettings(); loadDataset(); }, '140px')));
    }

    box.appendChild(field('Strategy', select(TT.strategies.map(function (x) {
      return { v: x.id, l: x.name };
    }), s.strategy, function (v) { s.strategy = v; saveSettings(); TT.ui.renderTicket(); TT.ui.updateCoach(); }, '250px')));

    var actions = el('div', { class: 'row tight' });
    actions.style.alignSelf = 'flex-end';
    actions.appendChild(el('button', { class: 'btn sm primary', onclick: randomSession }, '🎲 Random session'));
    actions.appendChild(el('button', { class: 'btn sm', onclick: function () { loadDataset(); } }, '↻ Restart'));
    var blindBtn = el('button', { class: 'chip' + (s.blind ? ' on' : ''), onclick: function () {
      s.blind = !s.blind; saveSettings(); renderSetup(); renderChart();
    } }, s.blind ? '🙈 Blind mode on' : '👁 Blind mode off');
    blindBtn.title = 'Blind mode hides the date and forward bars so you cannot recognise the outcome';
    actions.appendChild(blindBtn);
    box.appendChild(actions);
  }

  function randomSession() {
    var s = S.settings;
    if (s.mode === 'swing') {
      var syms = TT.data.symbols('1D');
      s.symbol = syms[Math.floor(Math.random() * syms.length)].symbol;
      saveSettings(); renderSetup();
      loadDataset({ random: true });
    } else {
      TT.data.randomDay(s.tf, function (ds) {
        if (!ds) return TT.toast('Could not load intraday data.', 'bad');
        s.symbol = ds.symbol; s.sessionDate = ds.sessionDate; saveSettings();
        renderSetup(); applyDataset(ds);
      });
    }
  }

  /* ================= dataset loading ================= */
  function loadDataset(opts) {
    var s = S.settings;
    if (s.mode === 'swing') {
      applyDataset(TT.data.buildSwing(s.symbol, opts || {}));
    } else {
      TT.data.ensure(s.tf, function (ok) {
        if (!ok) return TT.toast('Intraday data failed to load.', 'bad');
        var ds = TT.data.buildDay(s.tf, s.symbol, s.sessionDate);
        if (!ds) return TT.toast('No session data for that symbol.', 'bad');
        applyDataset(ds);
      });
    }
  }

  function applyDataset(ds) {
    if (!ds) return;
    S.ds = ds;
    stopPlay();
    if (TT.ui.resetTicket) TT.ui.resetTicket();
    var keepBalance = S.sim ? S.sim.startBalance : S.settings.startBalance;
    S.sim = new TT.Sim({
      startBalance: S.settings.startBalance || keepBalance,
      riskPct: S.settings.riskPct,
      slippageBps: S.settings.slippageBps,
      commission: S.settings.commission,
      shortingAllowed: S.settings.shortingAllowed,
      forceFlatAtSessionEnd: S.settings.forceFlatAtSessionEnd,
      stopFirstWhenAmbiguous: S.settings.stopFirstWhenAmbiguous
    });
    S.sim.load(ds, ds.startIdx);
    $('#c-sym').textContent = ds.symbol + ' · ' + ds.timeframe;
    $('#c-meta').textContent = (S.settings.blind && ds.intraday ? 'Session hidden (blind mode)' : ds.range) +
      ' · ' + ds.name + (ds.profile ? ' · ' + ds.profile : '');
    renderAll();
  }

  /* ================= indicators + chart ================= */
  function computeAnalysis() {
    var bars = S.sim.visible();
    if (bars.length < 12) { S.analysis = null; return; }
    var intraday = S.ds.intraday;
    var closes = TT.ind.closes(bars);
    var vwapReset = intraday ? function (b, i, arr) { return i > 0 && arr[i - 1].day !== b.day; } : null;
    S.analysis = {
      bars: bars,
      ema9: TT.ind.ema(closes, 9), ema20: TT.ind.ema(closes, 20),
      ema50: TT.ind.ema(closes, 50), ema200: TT.ind.ema(closes, 200),
      vwap: intraday ? TT.ind.vwap(bars, vwapReset) : null,
      bb: TT.ind.bollinger(closes, 20, 2), kc: TT.ind.keltner(bars, 20, 1.5),
      donchian: TT.ind.donchian(bars, 20), supertrend: TT.ind.supertrend(bars, 10, 3),
      psar: TT.ind.psar(bars), ichimoku: TT.ind.ichimoku(bars),
      rsi: TT.ind.rsi(closes, 14), macd: TT.ind.macd(closes),
      stoch: TT.ind.stochastic(bars), adx: TT.ind.adx(bars, 14),
      obv: TT.ind.obv(bars), mfi: TT.ind.mfi(bars, 14),
      atr: TT.ind.atr(bars, 14), rvol: TT.ind.rvol(bars, 20),
      snap: TT.ind.snapshot(bars, { intraday: intraday, vwapReset: vwapReset }),
      struct: TT.struct.analyze(bars, { intraday: intraday }),
      vp: TT.ind.volumeProfile(bars.slice(-120), 24)
    };
  }

  var OVERLAY_DEFS = [
    { id: 'ema', label: 'EMA 9/20/50/200' },
    { id: 'vwap', label: 'VWAP', intradayOnly: true },
    { id: 'bb', label: 'Bollinger' },
    { id: 'kc', label: 'Keltner' },
    { id: 'donchian', label: 'Donchian 20' },
    { id: 'supertrend', label: 'Supertrend' },
    { id: 'psar', label: 'Parabolic SAR' },
    { id: 'ichimoku', label: 'Ichimoku' },
    { id: 'levels', label: 'S/R levels' },
    { id: 'vp', label: 'Volume profile' },
    { id: 'pivots', label: 'Pivots' },
    { id: 'orb', label: 'Opening range', intradayOnly: true },
    { id: 'pdhl', label: 'Prior day H/L/C', intradayOnly: true },
    { id: 'fib', label: 'Fibonacci' },
    { id: 'avwap', label: 'Anchored VWAP' }
  ];
  var STRUCT_DEFS = [
    { id: 'swings', label: 'Swing points' },
    { id: 'bos', label: 'BOS / CHoCH' },
    { id: 'fvg', label: 'Fair value gaps' },
    { id: 'ob', label: 'Order blocks' },
    { id: 'sweeps', label: 'Liquidity sweeps' },
    { id: 'patterns', label: 'Candle patterns' }
  ];
  var SUB_DEFS = [
    { id: 'volume', label: 'Volume' }, { id: 'rsi', label: 'RSI' }, { id: 'macd', label: 'MACD' },
    { id: 'stoch', label: 'Stochastic' }, { id: 'adx', label: 'ADX/DMI' },
    { id: 'obv', label: 'OBV' }, { id: 'mfi', label: 'MFI' }, { id: 'none', label: 'None' }
  ];

  function renderOverlayBar() {
    var bar = $('#overlay-bar');
    bar.innerHTML = '';
    var intraday = S.ds && S.ds.intraday;
    bar.appendChild(el('span', { class: 'tiny dim' }, 'Tools:'));
    OVERLAY_DEFS.forEach(function (o) {
      if (o.intradayOnly && !intraday) return;
      var on = S.overlays.indexOf(o.id) >= 0;
      bar.appendChild(el('button', {
        class: 'chip' + (on ? ' on' : ''),
        onclick: function () {
          var i = S.overlays.indexOf(o.id);
          if (i >= 0) S.overlays.splice(i, 1); else S.overlays.push(o.id);
          TT.store.set('overlays', S.overlays); renderOverlayBar(); renderChart();
        }
      }, o.label));
    });
    bar.appendChild(el('span', { class: 'tiny dim', style: 'margin-left:8px' }, 'Structure:'));
    STRUCT_DEFS.forEach(function (o) {
      var on = S.structureOn.indexOf(o.id) >= 0;
      bar.appendChild(el('button', {
        class: 'chip' + (on ? ' on' : ''),
        onclick: function () {
          var i = S.structureOn.indexOf(o.id);
          if (i >= 0) S.structureOn.splice(i, 1); else S.structureOn.push(o.id);
          TT.store.set('structureOn', S.structureOn); renderOverlayBar(); renderChart();
        }
      }, o.label));
    });
    bar.appendChild(el('span', { class: 'tiny dim', style: 'margin-left:8px' }, 'Pane:'));
    SUB_DEFS.forEach(function (o) {
      bar.appendChild(el('button', {
        class: 'chip' + (S.subPane === o.id ? ' on' : ''),
        onclick: function () { S.subPane = o.id; TT.store.set('subPane', o.id); renderOverlayBar(); renderChart(); }
      }, o.label));
    });
  }

  function has(id) { return S.overlays.indexOf(id) >= 0; }
  function hasStruct(id) { return S.structureOn.indexOf(id) >= 0; }

  function renderChart() {
    if (!S.sim || !S.chart) return;
    computeAnalysis();
    var a = S.analysis, bars = S.sim.visible(), ch = S.chart;
    ch.setData(bars, S.ds.intraday ? 110 : 140);
    ch.follow();
    ch.overlays = {}; ch.clearAnnotations();
    if (!a) { ch.draw(); return; }

    if (has('ema')) {
      ch.overlays.ema9 = { data: a.ema9, color: 'rgba(76,154,255,.95)', width: 1.2 };
      ch.overlays.ema20 = { data: a.ema20, color: 'rgba(139,123,255,.95)', width: 1.4 };
      ch.overlays.ema50 = { data: a.ema50, color: 'rgba(224,166,58,.9)', width: 1.4 };
      ch.overlays.ema200 = { data: a.ema200, color: 'rgba(159,176,198,.8)', width: 1.6 };
    }
    if (has('vwap') && a.vwap) ch.overlays.vwap = { data: a.vwap, color: '#f5f0a8', width: 1.8 };
    if (has('bb')) {
      ch.overlays.bbU = { data: a.bb.upper, color: 'rgba(120,180,255,.5)', width: 1, dash: [3, 3] };
      ch.overlays.bbL = { data: a.bb.lower, color: 'rgba(120,180,255,.5)', width: 1, dash: [3, 3], fillTo: 'bbU', fillColor: 'rgba(76,154,255,.05)' };
      ch.overlays.bbM = { data: a.bb.mid, color: 'rgba(120,180,255,.35)', width: 1 };
    }
    if (has('kc')) {
      ch.overlays.kcU = { data: a.kc.upper, color: 'rgba(224,166,58,.45)', width: 1, dash: [5, 3] };
      ch.overlays.kcL = { data: a.kc.lower, color: 'rgba(224,166,58,.45)', width: 1, dash: [5, 3] };
    }
    if (has('donchian')) {
      ch.overlays.dcU = { data: a.donchian.upper, color: 'rgba(90,220,190,.6)', width: 1 };
      ch.overlays.dcL = { data: a.donchian.lower, color: 'rgba(90,220,190,.6)', width: 1 };
    }
    if (has('supertrend')) ch.overlays.st = { data: a.supertrend.line, color: 'rgba(46,200,140,.85)', width: 1.6 };
    if (has('psar')) ch.overlays.psar = { data: a.psar, color: 'rgba(255,255,255,.35)', width: 1, dash: [1, 4] };
    if (has('ichimoku')) {
      ch.overlays.tenkan = { data: a.ichimoku.tenkan, color: 'rgba(76,154,255,.8)', width: 1 };
      ch.overlays.kijun = { data: a.ichimoku.kijun, color: 'rgba(224,82,96,.8)', width: 1 };
      ch.overlays.spanA = { data: a.ichimoku.spanA, color: 'rgba(38,169,106,.5)', width: 1 };
      ch.overlays.spanB = { data: a.ichimoku.spanB, color: 'rgba(224,82,96,.4)', width: 1, fillTo: 'spanA', fillColor: 'rgba(76,154,255,.05)' };
    }
    if (has('avwap')) {
      var anchor = Math.max(0, bars.length - (S.ds.intraday ? 78 : 60));
      var av = TT.ind.anchoredVwap(bars, anchor, 1);
      ch.overlays.avwap = { data: av.vwap, color: 'rgba(255,170,220,.9)', width: 1.5 };
      ch.overlays.avwapU = { data: av.upper, color: 'rgba(255,170,220,.28)', width: 1, dash: [2, 4] };
      ch.overlays.avwapL = { data: av.lower, color: 'rgba(255,170,220,.28)', width: 1, dash: [2, 4] };
    }

    // horizontal levels
    if (has('levels') && a.struct) {
      a.struct.levels.slice(0, 5).forEach(function (l) {
        ch.lines.push({ price: l.price, color: l.side === 'resistance' ? 'rgba(224,82,96,.65)' : 'rgba(38,169,106,.65)',
          label: l.side === 'resistance' ? 'R ×' + l.touches : 'S ×' + l.touches, dash: [6, 4] });
      });
    }
    if (has('vp') && a.vp) {
      ch.lines.push({ price: a.vp.poc, color: 'rgba(255,214,102,.9)', label: 'POC', dash: [2, 2], width: 1.4 });
      ch.lines.push({ price: a.vp.vah, color: 'rgba(255,214,102,.45)', label: 'VAH', dash: [2, 5] });
      ch.lines.push({ price: a.vp.val, color: 'rgba(255,214,102,.45)', label: 'VAL', dash: [2, 5] });
    }
    if (has('pivots')) {
      var pv = priorPeriod(bars);
      if (pv) {
        var p = TT.ind.pivots(pv.h, pv.l, pv.c);
        [['P', p.P, .9], ['R1', p.R1, .6], ['S1', p.S1, .6], ['R2', p.R2, .4], ['S2', p.S2, .4]].forEach(function (x) {
          ch.lines.push({ price: x[1], color: 'rgba(160,190,255,' + x[2] + ')', label: x[0], dash: [3, 5] });
        });
      }
    }
    if (has('orb') && a.struct && a.struct.openingRange) {
      var or = a.struct.openingRange;
      ch.lines.push({ price: or.hi, color: 'rgba(120,255,214,.8)', label: 'OR high', dash: [5, 3] });
      ch.lines.push({ price: or.lo, color: 'rgba(120,255,214,.8)', label: 'OR low', dash: [5, 3] });
    }
    if (has('pdhl') && S.ds.intraday) {
      var pd = priorDay(bars);
      if (pd) {
        ch.lines.push({ price: pd.h, color: 'rgba(255,255,255,.45)', label: 'PDH', dash: [7, 4] });
        ch.lines.push({ price: pd.l, color: 'rgba(255,255,255,.45)', label: 'PDL', dash: [7, 4] });
        ch.lines.push({ price: pd.c, color: 'rgba(255,255,255,.3)', label: 'PDC', dash: [2, 6] });
      }
    }
    if (has('fib') && a.struct) {
      var sw = a.struct.swings;
      var lastH = sw.highs[sw.highs.length - 1], lastL = sw.lows[sw.lows.length - 1];
      if (lastH && lastL) {
        var f = TT.ind.fib(Math.min(lastH.price, lastL.price), Math.max(lastH.price, lastL.price));
        ['23.6%', '38.2%', '50%', '61.8%', '78.6%'].forEach(function (k) {
          ch.lines.push({ price: f[k], color: 'rgba(200,160,255,.55)', label: 'fib ' + k, dash: [2, 6] });
        });
      }
    }

    // structure annotations
    if (a.struct) {
      if (hasStruct('swings')) {
        a.struct.swings.highs.slice(-8).forEach(function (h) {
          ch.labels.push({ i: h.i, price: h.price, text: 'H', color: 'rgba(224,82,96,.85)', dy: -8 });
        });
        a.struct.swings.lows.slice(-8).forEach(function (l) {
          ch.labels.push({ i: l.i, price: l.price, text: 'L', color: 'rgba(38,169,106,.85)', dy: 14 });
        });
      }
      if (hasStruct('bos')) {
        a.struct.breaks.slice(-6).forEach(function (b) {
          ch.segments = ch.segments || [];
          ch.segments.push({ i1: b.from, p1: b.level, i2: b.i, p2: b.level,
            color: b.type === 'CHoCH' ? 'rgba(255,190,80,.95)' : 'rgba(120,180,255,.85)',
            dash: [4, 3], label: b.type });
        });
      }
      if (hasStruct('fvg')) {
        a.struct.fvgs.slice(-10).forEach(function (g) {
          ch.boxes.push({ from: g.i - 1, to: Math.min(bars.length - 1, g.filledAt || g.i + 12), hi: g.hi, lo: g.lo,
            fill: g.dir === 1 ? 'rgba(38,169,106,.10)' : 'rgba(224,82,96,.10)',
            stroke: g.dir === 1 ? 'rgba(38,169,106,.3)' : 'rgba(224,82,96,.3)',
            label: g.filled ? '' : 'FVG' });
        });
      }
      if (hasStruct('ob')) {
        a.struct.orderBlocks.slice(-6).forEach(function (o) {
          ch.boxes.push({ from: o.i, to: Math.min(bars.length - 1, o.i + 14), hi: o.hi, lo: o.lo,
            fill: o.dir === 1 ? 'rgba(76,154,255,.12)' : 'rgba(255,120,80,.12)',
            stroke: 'rgba(255,255,255,.14)', label: 'OB' });
        });
      }
      if (hasStruct('sweeps')) {
        a.struct.sweeps.slice(-6).forEach(function (s) {
          ch.labels.push({ i: s.i, price: s.level, text: '⚡', color: 'rgba(255,214,102,.95)', dy: s.dir === 1 ? 16 : -10, size: 11 });
        });
      }
      if (hasStruct('patterns')) {
        TT.scanPatterns(bars, Math.max(6, bars.length - 40)).slice(-14).forEach(function (h) {
          var bullish = /Bull/.test(h.bias);
          ch.labels.push({ i: h.i, price: bullish ? h.bar.l : h.bar.h, text: '•',
            color: bullish ? 'rgba(38,169,106,.9)' : 'rgba(224,82,96,.9)', dy: bullish ? 20 : -14, size: 14 });
        });
      }
    }

    // session boundaries
    if (S.ds.intraday) {
      ch.dividers = [];
      for (var di = 1; di < bars.length; di++) {
        if (bars[di].day !== bars[di - 1].day) {
          ch.dividers.push({ i: di, label: S.settings.blind ? 'new session' : bars[di].day });
        }
      }
    }

    // position / orders / trades
    var pos = S.sim.position;
    if (pos) {
      ch.lines.push({ price: pos.avg, color: 'rgba(255,255,255,.75)', label: 'Entry ' + pos.avg.toFixed(2), dash: [] });
      if (pos.stop) ch.lines.push({ price: pos.stop, color: 'rgba(224,82,96,.95)', label: 'Stop ' + pos.stop.toFixed(2), dash: [5, 3], width: 1.3 });
      if (pos.target) ch.lines.push({ price: pos.target, color: 'rgba(38,169,106,.95)', label: 'Target ' + pos.target.toFixed(2), dash: [5, 3], width: 1.3 });
      pos.scaleIns.forEach(function (sc) {
        ch.marks.push({ i: sc.i, price: sc.price, shape: pos.side === 'long' ? 'up' : 'down',
          color: pos.side === 'long' ? '#26a96a' : '#e05260' });
      });
    }
    S.sim.orders.forEach(function (o) {
      ch.lines.push({ price: o.price, color: 'rgba(76,154,255,.8)', label: o.type + ' ' + o.side + ' ' + o.qty, dash: [2, 4] });
    });
    S.sim.trades.forEach(function (t) {
      ch.marks.push({ i: t.entryIdx, price: t.entry, shape: t.side === 'long' ? 'up' : 'down', color: 'rgba(255,255,255,.8)' });
      ch.marks.push({ i: t.exitIdx, price: t.exit, shape: 'circle', color: t.pnl >= 0 ? '#26a96a' : '#e05260',
        label: (t.realizedR != null ? (t.realizedR >= 0 ? '+' : '') + t.realizedR.toFixed(1) + 'R' : U.signed(t.pnl)) });
    });

    // sub pane
    ch.subPane = S.subPane;
    ch.subSeries = null; ch.subGuides = null; ch.subRange = null; ch.subLabel = null;
    if (S.subPane === 'rsi') {
      ch.subSeries = [{ data: a.rsi, color: '#8b7bff' }];
      ch.subRange = [0, 100]; ch.subGuides = [{ v: 70 }, { v: 50 }, { v: 30 }]; ch.subLabel = 'RSI(14)';
    } else if (S.subPane === 'macd') {
      ch.subSeries = [{ data: a.macd.hist, type: 'hist' }, { data: a.macd.line, color: '#4c9aff' }, { data: a.macd.signal, color: '#e0a63a' }];
      ch.subGuides = [{ v: 0 }]; ch.subLabel = 'MACD(12,26,9)';
    } else if (S.subPane === 'stoch') {
      ch.subSeries = [{ data: a.stoch.k, color: '#4c9aff' }, { data: a.stoch.d, color: '#e0a63a' }];
      ch.subRange = [0, 100]; ch.subGuides = [{ v: 80 }, { v: 20 }]; ch.subLabel = 'Stochastic(14,3,3)';
    } else if (S.subPane === 'adx') {
      ch.subSeries = [{ data: a.adx.adx, color: '#fff' }, { data: a.adx.plusDI, color: '#26a96a' }, { data: a.adx.minusDI, color: '#e05260' }];
      ch.subRange = [0, 60]; ch.subGuides = [{ v: 25 }, { v: 20 }]; ch.subLabel = 'ADX / DMI (14)';
    } else if (S.subPane === 'obv') {
      ch.subSeries = [{ data: a.obv, color: '#7fd1a5' }]; ch.subLabel = 'On-Balance Volume';
    } else if (S.subPane === 'mfi') {
      ch.subSeries = [{ data: a.mfi, color: '#ffb0d0' }];
      ch.subRange = [0, 100]; ch.subGuides = [{ v: 80 }, { v: 20 }]; ch.subLabel = 'Money Flow Index(14)';
    }
    ch.draw();
    renderChartContext();
  }

  function priorPeriod(bars) {
    // previous session (intraday) or previous bar (daily) for pivots
    if (!S.ds.intraday) {
      if (bars.length < 2) return null;
      var p = bars[bars.length - 2];
      return { h: p.h, l: p.l, c: p.c };
    }
    return priorDay(bars);
  }
  function priorDay(bars) {
    var today = bars[bars.length - 1].day, h = -Infinity, l = Infinity, c = null, seen = false;
    for (var i = bars.length - 1; i >= 0; i--) {
      if (bars[i].day === today) continue;
      if (!seen) { seen = true; c = bars[i].c; var d = bars[i].day; 
        for (var j = i; j >= 0 && bars[j].day === d; j--) { if (bars[j].h > h) h = bars[j].h; if (bars[j].l < l) l = bars[j].l; }
        break;
      }
    }
    return seen ? { h: h, l: l, c: c } : null;
  }

  function renderChartContext() {
    var a = S.analysis;
    if (!a || !a.snap) return;
    var s = a.snap, st = a.struct, chips = [];
    if (st && st.trend) chips.push('<span class="chip ' + (st.trend.dir === 1 ? 'good' : st.trend.dir === -1 ? 'bad' : 'warn') + '">' + st.trend.label + '</span>');
    if (s.adx != null) chips.push('<span class="chip">ADX ' + s.adx.toFixed(0) + (s.adx < 20 ? ' (range)' : s.adx > 25 ? ' (trend)' : '') + '</span>');
    if (s.atr != null) chips.push('<span class="chip">ATR ' + s.atr.toFixed(2) + '</span>');
    if (s.rvol != null) chips.push('<span class="chip' + (s.rvol > 1.5 ? ' good' : s.rvol < 0.8 ? ' bad' : '') + '">RVOL ' + s.rvol.toFixed(2) + '×</span>');
    if (s.rsi != null) chips.push('<span class="chip">RSI ' + s.rsi.toFixed(0) + '</span>');
    if (s.vwap != null) chips.push('<span class="chip">' + (s.price > s.vwap ? 'Above' : 'Below') + ' VWAP</span>');
    $('#c-context').innerHTML = chips.join('');

    var lines = [];
    if (st && st.trend) lines.push('<div class="coach-item"><span class="ic">📐</span><div><strong>' + st.trend.label + '</strong><div class="tiny muted">' + st.trend.why.join(' · ') + '</div></div></div>');
    var lvlUp = st ? TT.struct.nearestLevel(st.levels, s.price, 1) : null;
    var lvlDn = st ? TT.struct.nearestLevel(st.levels, s.price, -1) : null;
    if (lvlUp) lines.push('<div class="coach-item"><span class="ic">🔺</span><div>Nearest resistance <strong>' + lvlUp.price.toFixed(2) + '</strong> (' + lvlUp.touches + ' touches, ' + ((lvlUp.price - s.price) / (s.atr || 1)).toFixed(1) + '× ATR away)</div></div>');
    if (lvlDn) lines.push('<div class="coach-item"><span class="ic">🔻</span><div>Nearest support <strong>' + lvlDn.price.toFixed(2) + '</strong> (' + lvlDn.touches + ' touches, ' + ((s.price - lvlDn.price) / (s.atr || 1)).toFixed(1) + '× ATR away)</div></div>');
    if (st && st.openingRange) lines.push('<div class="coach-item"><span class="ic">🕘</span><div>Opening range ' + st.openingRange.lo.toFixed(2) + ' – ' + st.openingRange.hi.toFixed(2) + ' · price is ' + (s.price > st.openingRange.hi ? 'above it' : s.price < st.openingRange.lo ? 'below it' : 'inside it') + '</div></div>');
    if (st && st.range) lines.push('<div class="coach-item"><span class="ic">📏</span><div>20-bar range ' + (st.range.height / (st.range.atr || 1)).toFixed(1) + '× ATR ' + (st.range.isTight ? '— compressed, expansion often follows' : '') + '</div></div>');
    var pats = TT.scanPatterns(a.bars, a.bars.length - 3).filter(function (h) { return h.i >= a.bars.length - 2; });
    if (pats.length) lines.push('<div class="coach-item"><span class="ic">🕯</span><div>Just printed: <strong>' + pats.map(function (p) { return p.name; }).join(', ') + '</strong><div class="tiny muted">Location decides whether this matters. Check the Candle Classroom.</div></div></div>');
    var lastBreak = st && st.breaks.length ? st.breaks[st.breaks.length - 1] : null;
    if (lastBreak && lastBreak.i >= a.bars.length - 12) lines.push('<div class="coach-item"><span class="ic">⚡</span><div><strong>' + lastBreak.type + ' ' + (lastBreak.dir === 1 ? 'up' : 'down') + '</strong> through ' + lastBreak.level.toFixed(2) + ', ' + (a.bars.length - 1 - lastBreak.i) + ' bars ago</div></div>');
    $('#live-context').innerHTML = lines.join('') || '<p class="muted small">Not enough bars yet.</p>';
  }

  /* ================= replay controls ================= */
  function step(n) {
    n = n || 1;
    for (var k = 0; k < n; k++) {
      if (S.sim.atEnd()) { stopPlay(); TT.toast('End of data for this session.', 'warn'); break; }
      var res = S.sim.step();
      (res.events || []).forEach(function (e) {
        if (e.trade) {
          TT.ui.onTradeClosed(e.trade);
          if (S.settings.autoReview) { stopPlay(); }
        } else if (e.type === 'entry') {
          TT.toast('Order filled at ' + e.price.toFixed(2), 'good');
        } else if (e.type === 'ambiguous') {
          TT.toast('Stop and target were both inside one bar — the trainer assumed the stop filled first.', 'warn', 6000);
        }
      });
      if (res.done) stopPlay();
    }
    renderAll();
  }

  function play() {
    if (S.playing) return;
    S.playing = true;
    $('#btn-play').textContent = '⏸ Pause';
    var ms = parseInt($('#speed').value, 10) || 600;
    S.timer = setInterval(function () { step(1); }, ms);
  }
  function stopPlay() {
    S.playing = false;
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
    var b = $('#btn-play'); if (b) b.textContent = '⏵ Play';
  }

  function renderReplayBar() {
    var sim = S.sim;
    var total = sim.bars.length - 1;
    var done = sim.cursor - (S.ds.sessionStart || 0);
    var span = total - (S.ds.sessionStart || 0);
    $('#prog').style.width = U.clamp(span ? done / span * 100 : 0, 0, 100) + '%';
    var bar = sim.last();
    $('#bar-count').textContent = 'bar ' + (sim.cursor + 1) + '/' + sim.bars.length +
      (S.settings.blind && S.ds.intraday ? ' · ' + (bar.label || '') : ' · ' + (bar.t || ''));
    $('#btn-next').disabled = sim.atEnd();
  }

  /* ================= wire up ================= */
  function renderAll() {
    renderAccount();
    renderChart();
    renderReplayBar();
    TT.ui.renderTicket();
    TT.ui.renderPosition();
    TT.ui.renderOrders();
    TT.ui.renderBlotter();
    TT.ui.renderStats();
    TT.ui.updateCoach();
  }
  TT.renderAll = renderAll;

  function initChart() {
    var cv = $('#chart');
    S.chart = new TT.Chart(cv, {
      visible: 140,
      onHover: function (bar) {
        if (!bar) { $('#c-ohlc').innerHTML = ''; return; }
        var ch = bar.c - bar.o, pct = bar.o ? ch / bar.o * 100 : 0;
        $('#c-ohlc').innerHTML =
          '<span>' + U.esc(bar.label || bar.t) + '</span>' +
          '<span>O <b>' + bar.o.toFixed(2) + '</b></span>' +
          '<span>H <b>' + bar.h.toFixed(2) + '</b></span>' +
          '<span>L <b>' + bar.l.toFixed(2) + '</b></span>' +
          '<span>C <b class="' + (ch >= 0 ? 'up' : 'dn') + '">' + bar.c.toFixed(2) + '</b></span>' +
          '<span class="' + (ch >= 0 ? 'up' : 'dn') + '">' + U.pct(pct) + '</span>' +
          '<span>V ' + U.vol(bar.v) + '</span>';
      }
    });
    S.chart.resize();
  }

  function initControls() {
    $('#btn-next').addEventListener('click', function () { step(1); });
    $('#btn-play').addEventListener('click', function () { S.playing ? stopPlay() : play(); });
    $('#btn-skip').addEventListener('click', function () { step(10); });
    $('#speed').addEventListener('change', function () { if (S.playing) { stopPlay(); play(); } });
    $('#btn-end').addEventListener('click', function () {
      stopPlay();
      if (S.sim.position) S.sim.closeAll('Closed at end of review');
      TT.ui.showSessionReview();
      renderAll();
    });
    $('#btn-session-review').addEventListener('click', TT.ui.showSessionReview);
    $('#rev-close').addEventListener('click', function () { $('#review-modal').hidden = true; });
    document.addEventListener('keydown', function (e) {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || '')) ) return;
      if ($('#view-sim').classList.contains('active') === false) return;
      if (e.key === 'n' || e.key === 'N' || e.key === ' ') { e.preventDefault(); step(1); }
      else if (e.key === 'p' || e.key === 'P') { S.playing ? stopPlay() : play(); }
      else if (e.key === 'f' || e.key === 'F') { if (S.sim.position) { S.sim.closeAll('Manual close (keyboard)'); TT.ui.onTradeClosed(S.sim.trades[S.sim.trades.length - 1]); renderAll(); } }
    });
  }

  TT.ui = TT.ui || {};
  TT.app = {
    S: S, renderAll: renderAll, go: go, step: step, loadDataset: loadDataset, stopPlay: stopPlay,
    renderSetup: renderSetup, renderOverlayBar: renderOverlayBar, renderChart: renderChart,
    renderAccount: renderAccount, saveSettings: saveSettings, defaults: DEFAULT_SETTINGS,
    boot: function () {
      initGate();
      buildNav();
      initChart();
      initControls();
      TT.ui.initViews();
      renderSetup();
      renderOverlayBar();
      loadDataset();
      var hash = (w.location.hash || '').replace('#', '');
      go(VIEWS.some(function (v) { return v.id === hash; }) ? hash : 'sim');
      w.addEventListener('hashchange', function () {
        var h = (w.location.hash || '').replace('#', '');
        if (VIEWS.some(function (v) { return v.id === h; })) go(h);
      });
    }
  };
})(window);
