/* app-views.js — the non-simulator tabs. */
(function (w) {
  'use strict';
  var TT = w.TT, U = TT.util, $ = TT.dom.$, $$ = TT.dom.$$, el = TT.dom.el;
  TT.ui = TT.ui || {};
  function S() { return TT.app.S; }

  /* ================= CANDLE CLASSROOM ================= */
  var patFilter = 'all';
  function renderPatterns() {
    var groups = ['all'].concat(TT.patterns.map(function (p) { return p.group; }).filter(function (v, i, a) { return a.indexOf(v) === i; }));
    var biases = ['Bullish', 'Bearish', 'Indecision'];
    var fbox = $('#pattern-filters');
    fbox.innerHTML = '';
    groups.forEach(function (g) {
      fbox.appendChild(el('button', {
        class: 'chip' + (patFilter === g ? ' on' : ''),
        onclick: function () { patFilter = g; renderPatterns(); }
      }, g === 'all' ? 'All ' + TT.patterns.length : g));
    });
    biases.forEach(function (b) {
      fbox.appendChild(el('button', {
        class: 'chip' + (patFilter === 'bias:' + b ? ' on' : ''),
        onclick: function () { patFilter = 'bias:' + b; renderPatterns(); }
      }, b));
    });

    var list = TT.patterns.filter(function (p) {
      if (patFilter === 'all') return true;
      if (patFilter.indexOf('bias:') === 0) return p.bias.indexOf(patFilter.slice(5)) >= 0;
      return p.group === patFilter;
    });
    $('#pattern-grid').innerHTML = list.map(function (p) {
      var biasCls = /Bullish/.test(p.bias) ? 'good' : /Bearish/.test(p.bias) ? 'bad' : 'warn';
      return '<div class="pattern-card">' +
        '<div class="pattern-art">' + TT.patternSVG(p.art) + '</div>' +
        '<div><h3 style="margin:0 0 4px">' + U.esc(p.name) + '</h3>' +
        '<div class="tagrow"><span class="chip ' + biasCls + '">' + U.esc(p.bias) + '</span>' +
        '<span class="chip">' + U.esc(p.group) + '</span>' +
        '<span class="chip">Reliability: ' + U.esc(p.reliability) + '</span></div></div>' +
        '<p class="small" style="margin:0">' + U.esc(p.what) + '</p>' +
        '<details class="acc"><summary class="small">Psychology, how to trade it, what kills it</summary><div class="body small">' +
        '<p><strong>Why it happens:</strong> ' + U.esc(p.psychology) + '</p>' +
        '<p><strong>How it is traded:</strong> ' + U.esc(p.trade) + '</p>' +
        '<p><strong>Confirmation:</strong> ' + U.esc(p.confirm) + '</p>' +
        '<p><strong>Invalidation:</strong> ' + U.esc(p.invalid) + '</p>' +
        '<p class="muted"><strong>Context:</strong> ' + U.esc(p.context) + '</p>' +
        '<button class="btn sm" data-find="' + p.id + '">Find recent examples on a real chart</button>' +
        '<div class="tiny dim" data-out="' + p.id + '" style="margin-top:8px"></div>' +
        '</div></details></div>';
    }).join('');

    $$('[data-find]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-find');
        var out = $('[data-out="' + id + '"]');
        out.innerHTML = 'Scanning real historical data…';
        var pat = TT.patternById(id), found = [];
        var syms = TT.data.symbols('1D');
        syms.forEach(function (s) {
          if (found.length >= 6) return;
          var bars = w.TT_DAILY.symbols[s.symbol].bars.map(function (r) {
            return { t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] };
          });
          for (var i = bars.length - 1; i > 20 && found.length < 6; i--) {
            var ok = false;
            try { ok = pat.detect(bars, i); } catch (e) { ok = false; }
            if (ok) {
              var after = bars.slice(i + 1, i + 6);
              var move = after.length ? (after[after.length - 1].c - bars[i].c) / bars[i].c * 100 : null;
              found.push(s.symbol + ' on ' + bars[i].t + (move != null ? ' → ' + U.pct(move) + ' over the next ' + after.length + ' days' : ''));
            }
          }
        });
        out.innerHTML = found.length
          ? '<strong>Real occurrences (daily bars):</strong><br>' + found.map(U.esc).join('<br>') +
            '<br><span class="dim">What followed each one is shown for study only — a handful of examples is not evidence of an edge, and outcomes vary enormously by context.</span>'
          : 'No occurrence found in this dataset.';
      });
    });
  }

  /* ---- quiz ---- */
  var quiz = null;
  function startQuiz() {
    var pool = TT.patterns.slice();
    quiz = { i: 0, score: 0, n: 10, qs: [] };
    for (var k = 0; k < quiz.n; k++) {
      var right = pool[Math.floor(Math.random() * pool.length)];
      var opts = [right];
      while (opts.length < 4) {
        var c = TT.patterns[Math.floor(Math.random() * TT.patterns.length)];
        if (opts.indexOf(c) < 0) opts.push(c);
      }
      opts.sort(function () { return Math.random() - 0.5; });
      quiz.qs.push({ right: right, opts: opts });
    }
    renderQuiz();
  }
  function renderQuiz() {
    var box = $('#quiz-box');
    if (!quiz) { box.innerHTML = ''; return; }
    if (quiz.i >= quiz.n) {
      box.innerHTML = '<div class="panel" style="margin-bottom:14px"><h3>Quiz complete — ' + quiz.score + '/' + quiz.n + '</h3>' +
        '<p class="small muted">' + (quiz.score >= 8 ? 'Strong recognition. Now practise reading these in the simulator where location and context change the meaning.'
          : quiz.score >= 5 ? 'Reasonable. Re-read the cards for the ones you missed — the psychology section is what makes them stick.'
          : 'Worth another pass. Focus on body size and wick position; almost every pattern is a statement about where the close sat in the range.') + '</p>' +
        '<button class="btn primary" id="quiz-again">Try again</button> <button class="btn ghost" id="quiz-stop">Close</button></div>';
      $('#quiz-again').addEventListener('click', startQuiz);
      $('#quiz-stop').addEventListener('click', function () { quiz = null; renderQuiz(); });
      return;
    }
    var q = quiz.qs[quiz.i];
    box.innerHTML = '<div class="panel" style="margin-bottom:14px">' +
      '<div class="panel-h"><h3 style="margin:0">Which pattern is this? (' + (quiz.i + 1) + '/' + quiz.n + ')</h3>' +
      '<span class="chip">Score ' + quiz.score + '</span></div>' +
      '<div class="pattern-art" style="max-width:320px;margin:0 auto 12px">' + TT.patternSVG(q.right.art) + '</div>' +
      '<div class="quiz-opts">' + q.opts.map(function (o, i) {
        return '<button class="btn" data-q="' + i + '">' + U.esc(o.name) + '</button>';
      }).join('') + '</div><div id="quiz-fb" class="small" style="margin-top:10px"></div></div>';
    $$('[data-q]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var pick = q.opts[parseInt(b.getAttribute('data-q'), 10)];
        var ok = pick === q.right;
        if (ok) quiz.score++;
        $$('[data-q]', box).forEach(function (x, ix) {
          if (q.opts[ix] === q.right) x.classList.add('right');
          else if (x === b) x.classList.add('wrong');
          x.disabled = true;
        });
        $('#quiz-fb').innerHTML = (ok ? '<span class="up">✓ Correct.</span> ' : '<span class="dn">✕ That was ' + U.esc(q.right.name) + '.</span> ') +
          U.esc(q.right.what) + ' <em>' + U.esc(q.right.context) + '</em>' +
          '<div style="margin-top:8px"><button class="btn sm primary" id="quiz-next">Next</button></div>';
        $('#quiz-next').addEventListener('click', function () { quiz.i++; renderQuiz(); });
      });
    });
  }

  /* ================= TOOLS ================= */
  function renderTools() {
    $('#tools-list').innerHTML = TT.tools.map(function (t) {
      return '<details class="acc"><summary><span class="num">' + t.n + '</span>' + U.esc(t.name) +
        '<span class="chip">' + U.esc(t.cat) + '</span><span class="chip">' + U.esc(t.level) + '</span>' +
        (t.chart ? '<span class="chip on">on chart</span>' : '') + '</summary>' +
        '<div class="body small">' +
        '<p><strong>What it is:</strong> ' + U.esc(t.what) + '</p>' +
        '<p><strong>How to read it:</strong> ' + U.esc(t.read) + '</p>' +
        '<p><strong>Settings:</strong> ' + U.esc(t.settings) + '</p>' +
        '<p><strong>Best for:</strong> ' + U.esc(t.best) + '</p>' +
        '<p class="muted"><strong>How it fails:</strong> ' + U.esc(t.pitfall) + '</p>' +
        (t.chart ? '<button class="btn sm" data-tool="' + t.chart + '">Show it on the simulator chart</button>' : '') +
        '</div></details>';
    }).join('');
    $('#tool-extras').innerHTML = TT.toolExtras.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('');
    $$('[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-tool');
        if (id.indexOf('sub-') === 0) {
          S().subPane = id.slice(4); TT.store.set('subPane', S().subPane);
        } else if (S().overlays.indexOf(id) < 0) {
          S().overlays.push(id); TT.store.set('overlays', S().overlays);
        }
        TT.app.renderOverlayBar(); TT.app.go('sim'); TT.app.renderChart();
        TT.toast('Enabled on the chart.', 'good');
      });
    });
  }

  /* ================= STRATEGIES ================= */
  function renderStrategies() {
    $('#strategy-list').innerHTML = TT.strategies.map(function (s) {
      function list(title, arr) {
        return arr && arr.length ? '<p><strong>' + title + '</strong></p><ul>' + arr.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul>' : '';
      }
      return '<details class="acc"><summary>' + U.esc(s.name) +
        '<span class="chip">' + U.esc(s.style === 'both' ? 'day + swing' : s.style) + '</span>' +
        '<span class="chip">' + U.esc(s.level) + '</span></summary>' +
        '<div class="body small">' +
        '<p>' + U.esc(s.summary) + '</p>' +
        '<div class="callout small"><strong>Why it works (when it works):</strong> ' + U.esc(s.why) + '</div>' +
        '<p class="tiny dim">Timeframes: ' + U.esc((s.timeframes || []).join(', ')) + ' · Tools: ' + U.esc((s.tools || []).join(', ')) + ' · Typical horizon: ' + U.esc(s.horizon || '—') + '</p>' +
        list('Entry rules', s.entry) + list('Stop placement', s.stopRules) + list('Exits', s.exits) +
        list('Invalidation', s.invalidation) + list('Tips', s.tips) + list('Common mistakes', s.mistakes) +
        '<p><strong>The coach checks these automatically:</strong></p><ul>' +
        (s.checklist || []).map(function (c) { return '<li>' + U.esc(c.label) + '</li>'; }).join('') + '</ul>' +
        '<button class="btn sm primary" data-strat="' + s.id + '">Trade this strategy in the simulator</button>' +
        '</div></details>';
    }).join('');
    $$('[data-strat]').forEach(function (b) {
      b.addEventListener('click', function () {
        S().settings.strategy = b.getAttribute('data-strat');
        TT.app.saveSettings(); TT.app.renderSetup(); TT.app.go('sim'); TT.app.renderAll();
        TT.toast('Strategy selected. Every trade is now graded against its rules.', 'good');
      });
    });
  }

  /* ================= STRUCTURE LAB ================= */
  var labState = { symbol: 'NVDA', show: 'swings', idx: null };
  var LAB_ITEMS = [
    { id: 'swings', label: 'Swing points', tip: 'A swing high has lower highs on both sides. Mark these first; every other structural idea is built from them. Remember they are only confirmed a few bars later.' },
    { id: 'bos', label: 'BOS / CHoCH', tip: 'Blue = break of structure (continuation). Amber = change of character, the first break against the prevailing trend and the earliest warning that control may be shifting.' },
    { id: 'fvg', label: 'Fair value gaps', tip: 'Three-bar imbalances where price moved too fast for two-sided trade. Shaded boxes remain until price returns to fill them — which is why they work as both pullback entries and targets.' },
    { id: 'ob', label: 'Order blocks', tip: 'The last opposing candle before a displacement move that broke structure. It marks where the aggressive side stepped in, and it is often defended on the first retest.' },
    { id: 'sweeps', label: 'Liquidity sweeps', tip: '⚡ marks a wick that pierced a prior swing and closed back inside — stops were taken and price rejected. The wick extreme becomes the invalidation level.' },
    { id: 'levels', label: 'S/R zones', tip: 'Clusters of swing points at similar prices. More touches means more people watching, which cuts both ways: stronger reaction, and more stops resting just beyond.' },
    { id: 'vp', label: 'Volume profile', tip: 'POC is the most-traded price (a magnet); the value area holds ~70% of volume. Price tends to rotate inside value and accelerate when it leaves.' },
    { id: 'patterns', label: 'Candle patterns', tip: 'Dots mark detected patterns. Notice how many print in the middle of a range and mean nothing — location is what separates a signal from a shape.' }
  ];

  TT.ui.renderLab = function () {
    var ctl = $('#lab-controls');
    ctl.innerHTML = '';
    var sel = el('select', { style: 'width:auto' });
    TT.data.symbols('1D').forEach(function (s) {
      var o = el('option', { value: s.symbol }, s.symbol);
      if (s.symbol === labState.symbol) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { labState.symbol = sel.value; labState.idx = null; drawLab(); });
    ctl.appendChild(sel);
    ctl.appendChild(el('button', { class: 'btn sm', onclick: function () { labState.idx = null; drawLab(true); } }, '🎲 Random window'));
    LAB_ITEMS.forEach(function (it) {
      ctl.appendChild(el('button', {
        class: 'chip' + (labState.show === it.id ? ' on' : ''),
        onclick: function () { labState.show = it.id; drawLab(); }
      }, it.label));
    });
    drawLab();
  };

  function drawLab(rand) {
    var sym = w.TT_DAILY.symbols[labState.symbol];
    if (!sym) return;
    var all = sym.bars.map(function (r) { return { t: r[0], label: r[0].slice(5), day: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }; });
    if (labState.idx == null || rand) labState.idx = 150 + Math.floor(Math.random() * Math.max(1, all.length - 240));
    var bars = all.slice(Math.max(0, labState.idx - 140), labState.idx + 40);
    if (!S().labChart) {
      S().labChart = new TT.Chart($('#lab-chart'), { visible: 160 });
      S().labChart.resize();
    }
    var ch = S().labChart;
    ch.setData(bars, 170); ch.follow(170);
    ch.overlays = {}; ch.clearAnnotations(); ch.subPane = 'volume';
    var a = TT.struct.analyze(bars, {});
    var show = labState.show;
    if (show === 'swings') {
      a.swings.highs.forEach(function (h) { ch.labels.push({ i: h.i, price: h.price, text: 'H', color: 'rgba(224,82,96,.9)', dy: -8 }); });
      a.swings.lows.forEach(function (l) { ch.labels.push({ i: l.i, price: l.price, text: 'L', color: 'rgba(38,169,106,.9)', dy: 14 }); });
    } else if (show === 'bos') {
      ch.segments = a.breaks.map(function (b) {
        return { i1: b.from, p1: b.level, i2: b.i, p2: b.level, color: b.type === 'CHoCH' ? 'rgba(255,190,80,.95)' : 'rgba(120,180,255,.9)', dash: [4, 3], label: b.type };
      });
    } else if (show === 'fvg') {
      // keep it readable: recent gaps only, capped extension, label the unfilled ones
      a.fvgs.slice(-14).forEach(function (g) {
        var to = g.filled ? g.filledAt : Math.min(bars.length - 1, g.i + 25);
        ch.boxes.push({ from: g.i - 1, to: to, hi: g.hi, lo: g.lo,
          fill: g.dir === 1 ? 'rgba(38,169,106,' + (g.filled ? '.07' : '.16') + ')' : 'rgba(224,82,96,' + (g.filled ? '.07' : '.16') + ')',
          stroke: g.filled ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.2)',
          label: g.filled ? '' : 'unfilled' });
      });
    } else if (show === 'ob') {
      a.orderBlocks.forEach(function (o) {
        ch.boxes.push({ from: o.i, to: Math.min(bars.length - 1, o.i + 18), hi: o.hi, lo: o.lo,
          fill: o.dir === 1 ? 'rgba(76,154,255,.15)' : 'rgba(255,120,80,.15)', stroke: 'rgba(255,255,255,.15)', label: 'OB' });
      });
    } else if (show === 'sweeps') {
      a.sweeps.forEach(function (s) { ch.labels.push({ i: s.i, price: s.level, text: '⚡', color: 'rgba(255,214,102,.95)', dy: s.dir === 1 ? 16 : -10, size: 12 }); });
    } else if (show === 'levels') {
      a.levels.slice(0, 8).forEach(function (l) {
        ch.lines.push({ price: l.price, color: l.side === 'resistance' ? 'rgba(224,82,96,.7)' : 'rgba(38,169,106,.7)', label: (l.side === 'resistance' ? 'R' : 'S') + ' ×' + l.touches, dash: [6, 4] });
      });
    } else if (show === 'vp' && a.volumeProfile) {
      ch.lines.push({ price: a.volumeProfile.poc, color: 'rgba(255,214,102,.95)', label: 'POC', width: 1.5, dash: [2, 2] });
      ch.lines.push({ price: a.volumeProfile.vah, color: 'rgba(255,214,102,.5)', label: 'VAH', dash: [2, 5] });
      ch.lines.push({ price: a.volumeProfile.val, color: 'rgba(255,214,102,.5)', label: 'VAL', dash: [2, 5] });
    } else if (show === 'patterns') {
      TT.scanPatterns(bars, 20).forEach(function (h) {
        var bullish = /Bull/.test(h.bias);
        ch.labels.push({ i: h.i, price: bullish ? h.bar.l : h.bar.h, text: '•', color: bullish ? 'rgba(38,169,106,.9)' : 'rgba(224,82,96,.9)', dy: bullish ? 20 : -14, size: 14 });
      });
    }
    ch.draw();

    var item = LAB_ITEMS.filter(function (x) { return x.id === show; })[0];
    var counts = [
      ['Swing highs / lows', a.swings.highs.length + ' / ' + a.swings.lows.length],
      ['BOS / CHoCH events', a.breaks.length],
      ['Fair value gaps (unfilled)', a.fvgs.filter(function (g) { return !g.filled; }).length + ' of ' + a.fvgs.length],
      ['Order blocks', a.orderBlocks.length],
      ['Liquidity sweeps', a.sweeps.length],
      ['S/R clusters (2+ touches)', a.levels.length],
      ['Trend read', a.trend.label]
    ];
    $('#lab-readout').innerHTML =
      '<div class="panel"><h3>' + U.esc(item.label) + '</h3><p class="small">' + U.esc(item.tip) + '</p>' +
      '<p class="tiny dim">Window: ' + U.esc(bars[0].t) + ' → ' + U.esc(bars[bars.length - 1].t) + ' · ' + U.esc(labState.symbol) + ' daily bars. Detection uses fixed rules; discretionary traders will mark some of these differently, and that is normal.</p></div>' +
      '<div class="panel"><h3>Detected in this window</h3><table><tbody>' +
      counts.map(function (c) { return '<tr><td class="act">' + c[0] + '</td><td><strong>' + U.esc(String(c[1])) + '</strong></td></tr>'; }).join('') +
      '</tbody></table><p class="tiny dim" style="margin-top:8px">' + U.esc(a.trend.why.join(' · ')) + '</p></div>';
  }

  /* ================= OPTIONS ================= */
  function renderOptions() {
    var o = TT.options;
    $('#options-body').innerHTML =
      '<div class="panel prose" style="margin-bottom:14px">' +
      '<h2>Options 101 — terminology and how entries are chosen</h2>' +
      '<div class="callout warn"><strong>Scope:</strong> ' + U.esc(o.scope) + '</div>' +
      '<div class="callout dngr"><strong>Risk:</strong> Options can lose 100% of their value, including through time decay alone while you are right about direction. Some options strategies carry unlimited risk. Nothing on this page is a recommendation to trade options. Before trading options anywhere, read the OCC disclosure document “Characteristics and Risks of Standardized Options”, which your broker must provide.</div>' +
      '</div>' +
      '<div class="grid cards-2">' +
      '<div class="panel prose"><h3>How an options entry is actually selected</h3>' +
      o.entrySteps.map(function (s) { return '<h4 style="margin-top:14px">' + U.esc(s.h) + '</h4><p class="small">' + U.esc(s.p) + '</p>'; }).join('') +
      '<h3 style="margin-top:18px">Where beginners lose money</h3><ul class="small">' +
      o.mistakes.map(function (m) { return '<li>' + U.esc(m) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="panel prose"><h3>Terminology</h3><dl class="kv">' +
      o.terms.map(function (t) { return '<dt>' + U.esc(t.t) + '</dt><dd class="small">' + U.esc(t.d) + '</dd>'; }).join('') +
      '</dl><h3 style="margin-top:18px">Why this trainer does not simulate options</h3><ul class="small">' +
      o.whyNotSimulated.map(function (x) { return '<li>' + U.esc(x) + '</li>'; }).join('') + '</ul></div></div>';
  }

  /* ================= LEARN ================= */
  function renderLearn() {
    var nav = $('#lesson-nav');
    nav.innerHTML = '';
    TT.lessons.forEach(function (l, i) {
      nav.appendChild(el('button', {
        class: 'btn sm ghost', style: 'display:block;width:100%;text-align:left;margin-bottom:4px',
        'data-lesson': l.id,
        onclick: function () { showLesson(i); }
      }, l.title + '<div class="tiny dim">' + l.level + ' · ' + l.mins + ' min</div>'));
    });
    showLesson(0);
  }
  function showLesson(i) {
    var l = TT.lessons[i];
    $$('#lesson-nav button').forEach(function (b, ix) { b.classList.toggle('primary', ix === i); b.classList.toggle('ghost', ix !== i); });
    $('#lesson-body').innerHTML = '<div class="tiny dim">' + U.esc(l.level) + ' · ' + l.mins + ' min read</div><h2>' + U.esc(l.title) + '</h2>' + l.html +
      '<hr><p class="tiny dim">Educational content only. Not investment, legal or tax advice. Regulatory summaries were current as of September 2026 — verify with your broker and primary sources.</p>';
  }

  /* ================= JOURNAL ================= */
  TT.ui.renderJournal = function () {
    var j = TT.store.get('journal', []);
    $('#journal-count').textContent = j.length + ' trades recorded';
    if (!j.length) {
      $('#journal-stats').innerHTML = '';
      $('#journal-notes').innerHTML = '<p class="muted small">No trades yet. Close a simulated trade and it will appear here automatically with its R multiple, MAE/MFE and process grade.</p>';
      $('#journal-table').innerHTML = '';
      return;
    }
    var pnl = j.map(function (t) { return t.pnl; });
    var wins = pnl.filter(function (x) { return x > 0; }), losses = pnl.filter(function (x) { return x < 0; });
    var rs = j.filter(function (t) { return t.realizedR != null; }).map(function (t) { return t.realizedR; });
    var grossW = U.sum(wins), grossL = Math.abs(U.sum(losses));
    var byStrat = {};
    j.forEach(function (t) {
      var k = t.strategy || 'unspecified';
      byStrat[k] = byStrat[k] || { n: 0, pnl: 0, r: [], grades: [] };
      byStrat[k].n++; byStrat[k].pnl += t.pnl;
      if (t.realizedR != null) byStrat[k].r.push(t.realizedR);
      if (t.score != null) byStrat[k].grades.push(t.score);
    });
    var cards = [
      ['Trades', String(j.length), '', ''],
      ['Net P&L', U.signed(U.sum(pnl)), U.sum(pnl) >= 0 ? 'up' : 'dn', 'simulated'],
      ['Win rate', (wins.length / j.length * 100).toFixed(0) + '%', '', wins.length + 'W / ' + losses.length + 'L'],
      ['Expectancy', rs.length ? U.mean(rs).toFixed(2) + 'R' : '—', U.mean(rs) > 0 ? 'up' : 'dn', 'per trade'],
      ['Profit factor', grossL ? (grossW / grossL).toFixed(2) : '—', grossW > grossL ? 'up' : 'dn', ''],
      ['Avg process score', U.mean(j.filter(function (t) { return t.score != null; }).map(function (t) { return t.score; })).toFixed(0) + '/100', '', 'what you control'],
      ['Avg MFE captured', avgCapture(j), '', 'realised R ÷ best R'],
      ['Avg risk/trade', U.mean(j.filter(function (t) { return t.riskPctOfEquity != null; }).map(function (t) { return t.riskPctOfEquity; })).toFixed(2) + '%', '', 'of equity']
    ];
    $('#journal-stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><div class="k">' + c[0] + '</div><div class="v ' + c[2] + '">' + c[1] + '</div><div class="sub">' + c[3] + '</div></div>';
    }).join('');

    var notes = [];
    Object.keys(byStrat).forEach(function (k) {
      var s = byStrat[k], name = TT.strategyById(k).name;
      var exp = s.r.length ? U.mean(s.r) : null;
      notes.push('<strong>' + U.esc(name) + '</strong>: ' + s.n + ' trades, ' + U.signed(s.pnl) +
        (exp != null ? ', expectancy ' + exp.toFixed(2) + 'R' : '') +
        (s.grades.length ? ', average process score ' + U.mean(s.grades).toFixed(0) : '') +
        (s.n < 20 ? ' <span class="dim">— sample too small to mean anything yet (aim for 100).</span>' : ''));
    });
    var giveBacks = j.filter(function (t) { return t.mfeR >= 1 && t.realizedR <= 0; }).length;
    if (giveBacks) notes.push('<span class="dn">' + giveBacks + ' trade(s) were up 1R or more and closed at or below break-even.</span> A mechanical rule — stop to break-even at +1R, or scale half at +1R — would have changed every one of them.');
    var noStops = j.filter(function (t) { return !t.stop; }).length;
    if (noStops) notes.push('<span class="dn">' + noStops + ' trade(s) had no stop loss.</span> That is the habit that ends real accounts.');
    var best = j.slice().sort(function (a, b) { return (b.realizedR || 0) - (a.realizedR || 0); })[0];
    var worst = j.slice().sort(function (a, b) { return (a.realizedR || 0) - (b.realizedR || 0); })[0];
    if (best && best.realizedR != null) notes.push('Best trade: ' + U.esc(best.symbol) + ' ' + best.side + ' ' + best.realizedR.toFixed(2) + 'R (grade ' + best.grade + '). Worst: ' + U.esc(worst.symbol) + ' ' + worst.side + ' ' + worst.realizedR.toFixed(2) + 'R (grade ' + worst.grade + ').');
    notes.push('<span class="dim">Simulated results only. Hypothetical performance has inherent limitations and does not reflect real execution, costs or the psychological pressure of trading actual money.</span>');
    $('#journal-notes').innerHTML = '<ul class="small">' + notes.map(function (n) { return '<li style="margin-bottom:7px">' + n + '</li>'; }).join('') + '</ul>';

    $('#journal-table').innerHTML = '<table><thead><tr><th>Date</th><th>Symbol</th><th>TF</th><th>Side</th><th>Entry</th><th>Exit</th><th>R</th><th>P&amp;L</th><th>MFE/MAE</th><th>Grade</th><th>Strategy</th><th>Note</th></tr></thead><tbody>' +
      j.slice().reverse().map(function (t) {
        return '<tr><td>' + U.esc((t.at || '').slice(0, 10)) + '</td><td>' + U.esc(t.symbol) + '</td><td>' + U.esc(t.timeframe) +
          '</td><td class="' + (t.side === 'long' ? 'up' : 'dn') + '">' + t.side + '</td><td>' + t.entry.toFixed(2) + '</td><td>' + t.exit.toFixed(2) +
          '</td><td class="' + (t.realizedR >= 0 ? 'up' : 'dn') + '">' + (t.realizedR != null ? t.realizedR.toFixed(2) : '—') +
          '</td><td class="' + (t.pnl >= 0 ? 'up' : 'dn') + '">' + U.signed(t.pnl) + '</td><td class="dim">' +
          (t.mfeR != null ? t.mfeR.toFixed(1) + '/' + t.maeR.toFixed(1) : '—') + '</td><td>' + U.esc(t.grade || '—') +
          '</td><td class="dim">' + U.esc(TT.strategyById(t.strategy).name.split(' (')[0]) + '</td><td class="act tiny dim">' + U.esc(t.note || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  };

  function avgCapture(j) {
    var v = j.filter(function (t) { return t.mfeR > 0.2 && t.realizedR != null; })
      .map(function (t) { return U.clamp(t.realizedR / t.mfeR, -1, 1); });
    return v.length ? (U.mean(v) * 100).toFixed(0) + '%' : '—';
  }

  function download(name, text, type) {
    try {
      var blob = new Blob([text], { type: type || 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: name });
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
    } catch (e) { TT.toast('Download blocked by the browser. Copy from the table instead.', 'warn'); }
  }

  /* ================= SETTINGS ================= */
  function renderSettings() {
    var s = S().settings, box = $('#settings-form');
    box.innerHTML = '';
    function num(label, key, min, max, step, hint) {
      var wrap = el('label', { class: 'field' }, '<span>' + label + '</span>');
      var i = el('input', { type: 'number', min: min, max: max, step: step, value: s[key] });
      i.addEventListener('change', function () {
        var v = parseFloat(i.value);
        if (isNaN(v)) return;
        s[key] = U.clamp(v, min, max);
        i.value = s[key];
        TT.app.saveSettings();
        if (key === 'startBalance') {
          TT.app.loadDataset();
          TT.toast('Paper balance set to ' + U.money(s.startBalance) + ' and the session restarted.', 'good');
        } else TT.app.renderAll();
      });
      wrap.appendChild(i);
      if (hint) wrap.appendChild(el('div', { class: 'tiny dim' }, hint));
      return wrap;
    }
    box.appendChild(num('Starting paper balance ($)', 'startBalance', 100, 1000000, 100,
      'Default $2,000. Changing this restarts the current session. Imaginary money — there is no deposit and no withdrawal.'));
    box.appendChild(num('Risk per trade (%)', 'riskPct', 0.1, 20, 0.1,
      'Used by the position-size calculator. Professionals typically use 0.5-2%. Above 2% the coach will warn you.'));
    box.appendChild(num('Slippage (basis points)', 'slippageBps', 0, 100, 1,
      'Applied to market and stop fills. 1 bp = 0.01% of price. This is a crude model: it overstates the cost on liquid mega-caps and understates it badly in fast markets and on thin names.'));
    box.appendChild(num('Commission per trade ($)', 'commission', 0, 20, 0.5,
      'Most US brokers charge $0 on stock trades, but set a value to feel how costs affect an active style.'));

    [['autoReview', 'Show the review card automatically after each closed trade'],
     ['shortingAllowed', 'Allow short selling'],
     ['forceFlatAtSessionEnd', 'Force flat at the session close in day-trading mode'],
     ['stopFirstWhenAmbiguous', 'When stop and target are both inside one bar, assume the stop filled first (conservative)']
    ].forEach(function (t) {
      var lab = el('label', { class: 'toggle', style: 'margin:8px 0' });
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!s[t[0]];
      cb.addEventListener('change', function () { s[t[0]] = cb.checked; TT.app.saveSettings(); TT.app.renderAll(); });
      lab.appendChild(cb); lab.appendChild(el('span', {}, t[1]));
      box.appendChild(lab);
    });

    var row = el('div', { class: 'btn-group', style: 'margin-top:12px' });
    row.appendChild(el('button', { class: 'btn', onclick: function () {
      TT.app.loadDataset();
      TT.toast('Session reset. Paper balance back to ' + U.money(s.startBalance) + '.', 'good');
    } }, 'Reset session'));
    row.appendChild(el('button', { class: 'btn ghost', onclick: function () {
      if (!w.confirm('Reset ALL settings and delete the saved journal? This cannot be undone.')) return;
      TT.store.clearAll(); w.location.reload();
    } }, 'Reset everything'));
    box.appendChild(row);

    var meta = TT.data.meta();
    $('#assumptions').innerHTML = '<ul class="small">' + [
      'Market orders fill at the current bar\'s close plus slippage. Real fills happen at the next available price and can be materially worse.',
      'Limit orders fill if the bar\'s range reaches your price; real limit orders also depend on queue position and may not fill at all.',
      'Stop orders become market orders and fill at the stop price plus slippage, or at the bar\'s open if it gapped past your stop.',
      'When a stop and a target are both inside the same bar, the trainer assumes the stop filled first (the conservative assumption) — real life is decided by tick sequence you cannot see.',
      'No margin, no leverage, no borrow fees, no short-sale locates, no dividends, no corporate actions, no taxes, no halts and no partial fills are modelled.',
      'Bars are regular-session only (09:30-16:00 ET). Pre-market and after-hours activity is not shown, so overnight gaps appear instantaneous.',
      'Data: ' + U.esc(meta.source || 'historical provider') + ', ' + U.esc(meta.adjustment || 'split-adjusted') + ', captured ' + U.esc(meta.captured || '2026-09-15') + '. Static and historical — not live.'
    ].map(function (x) { return '<li style="margin-bottom:6px">' + x + '</li>'; }).join('') + '</ul>';
  }

  /* ================= LEGAL ================= */
  function renderLegal() {
    $('#legal-body').innerHTML = '<h2>Legal, risk disclosure and terms of use</h2>' +
      '<div class="callout dngr"><strong>' + U.esc(TT.legal.shortBanner) + '</strong></div>' +
      TT.legal.sections.map(function (s) {
        return '<h3>' + U.esc(s.h) + '</h3>' + s.p.map(function (p) { return '<p>' + p + '</p>'; }).join('');
      }).join('') +
      '<hr><p class="tiny dim">Last reviewed September 2026. This document is provided as a good-faith disclosure for an educational tool and is not legal advice. Anyone deploying this trainer publicly should have counsel review it for their jurisdiction and add their own entity details, governing law and contact information.</p>';
  }

  /* ================= init ================= */
  TT.ui.initViews = function () {
    renderPatterns();
    renderTools();
    renderStrategies();
    renderOptions();
    renderLearn();
    renderSettings();
    renderLegal();
    $('#btn-quiz').addEventListener('click', startQuiz);
    $('#btn-export').addEventListener('click', function () {
      download('trading-trainer-journal.json', JSON.stringify({
        exported: new Date().toISOString(),
        disclaimer: 'Simulated trades from an educational trainer. Not a record of real trading.',
        trades: TT.store.get('journal', [])
      }, null, 2));
    });
    $('#btn-export-csv').addEventListener('click', function () {
      var j = TT.store.get('journal', []);
      if (!j.length) return TT.toast('Journal is empty.', 'warn');
      var cols = ['at', 'symbol', 'timeframe', 'side', 'qty', 'entry', 'exit', 'stop', 'target', 'pnl', 'realizedR', 'plannedR', 'mfeR', 'maeR', 'reason', 'barsHeld', 'strategy', 'grade', 'score', 'note'];
      var csv = cols.join(',') + '\n' + j.map(function (t) {
        return cols.map(function (c) {
          var v = t[c] == null ? '' : String(t[c]);
          return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
        }).join(',');
      }).join('\n');
      download('trading-trainer-journal.csv', csv, 'text/csv');
    });
    $('#btn-clear-journal').addEventListener('click', function () {
      if (!w.confirm('Delete every recorded trade from this browser? This cannot be undone.')) return;
      TT.store.del('journal'); TT.ui.renderJournal(); TT.toast('Journal cleared.', 'warn');
    });
    var dd = $('#data-date');
    if (dd) dd.textContent = TT.data.meta().captured || '2026-09-15';
  };
})(window);
