/* data.js — turns the static historical snapshots into replay datasets.
   Intraday files are large, so they load on demand. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};
  var D = TT.data = {};
  var loading = {};

  D.meta = function () { return (w.TT_DAILY && w.TT_DAILY.meta) || {}; };

  /* Lazy-load a data file by injecting a script tag (works from file:// too). */
  D.ensure = function (tf, cb) {
    var map = { '5m': ['TT_M5', 'data/intraday-5m.js'], '1m': ['TT_M1', 'data/intraday-1m.js'] };
    if (tf === '1D') return cb(true);
    var spec = map[tf];
    if (!spec) return cb(false);
    if (w[spec[0]]) return cb(true);
    if (loading[tf]) { loading[tf].push(cb); return; }
    loading[tf] = [cb];
    var s = document.createElement('script');
    s.src = spec[1];
    s.onload = function () { loading[tf].forEach(function (f) { f(!!w[spec[0]]); }); loading[tf] = null; };
    s.onerror = function () { loading[tf].forEach(function (f) { f(false); }); loading[tf] = null; };
    document.head.appendChild(s);
  };

  D.symbols = function (tf) {
    var src = tf === '1D' ? w.TT_DAILY : tf === '5m' ? w.TT_M5 : w.TT_M1;
    if (!src) return [];
    return Object.keys(src.symbols).map(function (k) {
      return { symbol: k, name: src.symbols[k].name, profile: src.symbols[k].profile };
    });
  };

  D.sessions = function (tf, symbol) {
    var src = tf === '5m' ? w.TT_M5 : tf === '1m' ? w.TT_M1 : null;
    if (!src || !src.symbols[symbol]) return [];
    return Object.keys(src.symbols[symbol].sessions).sort();
  };

  /* ---- swing dataset: daily bars, replay starts after a warm-up window ---- */
  D.buildSwing = function (symbol, opts) {
    opts = opts || {};
    var s = w.TT_DAILY.symbols[symbol];
    if (!s) return null;
    var bars = s.bars.map(function (r) {
      return { t: r[0], label: r[0].slice(5), day: r[0], date: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] };
    });
    var warm = opts.warmup || 220;
    var startIdx = opts.startIdx != null ? opts.startIdx
      : opts.random ? warm + Math.floor(Math.random() * Math.max(1, bars.length - warm - 80))
      : Math.max(warm, bars.length - 180);
    return {
      symbol: symbol, name: s.name, profile: s.profile, timeframe: '1D', intraday: false,
      bars: bars, startIdx: Math.min(startIdx, bars.length - 20),
      label: symbol + ' · Daily · swing mode',
      range: bars[0].t + ' → ' + bars[bars.length - 1].t
    };
  };

  /* ---- day dataset: the chosen session, preceded by context sessions ---- */
  D.buildDay = function (tf, symbol, sessionDate, opts) {
    opts = opts || {};
    var src = tf === '5m' ? w.TT_M5 : w.TT_M1;
    if (!src || !src.symbols[symbol]) return null;
    var sess = src.symbols[symbol].sessions;
    var days = Object.keys(sess).sort();
    if (!sessionDate) sessionDate = days[days.length - 1];
    var di = days.indexOf(sessionDate);
    if (di < 0) return null;
    var ctxCount = opts.contextSessions == null ? 2 : opts.contextSessions;
    var use = days.slice(Math.max(0, di - ctxCount), di + 1);
    var bars = [], startIdx = 0;
    use.forEach(function (day) {
      if (day === sessionDate) startIdx = bars.length;
      sess[day].forEach(function (r) {
        bars.push({
          t: day + ' ' + TT.util.sessionTime(r[0]), label: TT.util.sessionTime(r[0]),
          day: day, date: day, off: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5]
        });
      });
    });
    return {
      symbol: symbol, name: src.symbols[symbol].name, profile: src.symbols[symbol].profile,
      timeframe: tf, intraday: true, bars: bars,
      // start the replay a few bars into the session so the open is visible but undecided
      startIdx: Math.min(bars.length - 5, startIdx + (opts.openBars == null ? 2 : opts.openBars)),
      sessionStart: startIdx, sessionDate: sessionDate,
      label: symbol + ' · ' + tf + ' · ' + sessionDate,
      range: use[0] + ' → ' + sessionDate
    };
  };

  D.randomDay = function (tf, cb) {
    D.ensure(tf, function (ok) {
      if (!ok) return cb(null);
      var syms = D.symbols(tf);
      var sym = syms[Math.floor(Math.random() * syms.length)].symbol;
      var days = D.sessions(tf, sym);
      // keep at least 2 prior sessions of context
      var pick = days[2 + Math.floor(Math.random() * Math.max(1, days.length - 2))];
      cb(D.buildDay(tf, sym, pick));
    });
  };
})(window);
