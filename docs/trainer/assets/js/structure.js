/* structure.js — market structure detection.
   Everything here is computed from bars ALREADY PRINTED (index <= cursor).
   Swings are confirmed with a lookback/lookforward window, which is exactly why a swing
   point is only "known" some bars after it forms — the trainer respects that delay. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};
  var S = TT.struct = {};

  /* Fractal swing highs/lows. strength = bars required on each side. */
  S.swings = function (bars, strength) {
    strength = strength || 2;
    var highs = [], lows = [];
    for (var i = strength; i < bars.length - strength; i++) {
      var isH = true, isL = true;
      for (var j = i - strength; j <= i + strength; j++) {
        if (j === i) continue;
        if (bars[j].h >= bars[i].h) isH = false;
        if (bars[j].l <= bars[i].l) isL = false;
      }
      if (isH) highs.push({ i: i, price: bars[i].h, confirmedAt: i + strength, t: bars[i].t });
      if (isL) lows.push({ i: i, price: bars[i].l, confirmedAt: i + strength, t: bars[i].t });
    }
    return { highs: highs, lows: lows, strength: strength };
  };

  /* Trend read that mirrors how a discretionary trader actually reads a chart:
     structure first (HH/HL vs LH/LL), moving averages second, ADX for conviction. */
  S.trend = function (bars, sw) {
    var n = bars.length;
    if (n < 30) return { dir: 0, label: 'Not enough data', why: [], strength: 0 };
    sw = sw || S.swings(bars, 2);
    var hs = sw.highs.slice(-3), ls = sw.lows.slice(-3), why = [], score = 0;

    if (hs.length >= 2 && ls.length >= 2) {
      var hh = hs[hs.length - 1].price > hs[hs.length - 2].price;
      var hl = ls[ls.length - 1].price > ls[ls.length - 2].price;
      var lh = hs[hs.length - 1].price < hs[hs.length - 2].price;
      var ll = ls[ls.length - 1].price < ls[ls.length - 2].price;
      if (hh && hl) { score += 2; why.push('Higher high + higher low (uptrend structure)'); }
      else if (lh && ll) { score -= 2; why.push('Lower high + lower low (downtrend structure)'); }
      else why.push('Mixed swing structure — range or transition');
    }
    var c = TT.ind.closes(bars);
    var e20 = TT.ind.ema(c, 20), e50 = TT.ind.ema(c, 50), i = n - 1;
    if (e20[i] != null && e50[i] != null) {
      if (c[i] > e20[i] && e20[i] > e50[i]) { score += 1.5; why.push('Price > 20 EMA > 50 EMA'); }
      else if (c[i] < e20[i] && e20[i] < e50[i]) { score -= 1.5; why.push('Price < 20 EMA < 50 EMA'); }
      else why.push('Price tangled around the 20/50 EMA');
    }
    var adx = TT.ind.adx(bars, 14).adx[i];
    if (adx != null) {
      if (adx >= 25) why.push('ADX ' + adx.toFixed(0) + ' — trending conditions');
      else if (adx < 20) { score *= 0.5; why.push('ADX ' + adx.toFixed(0) + ' — chop, trend signals are unreliable'); }
    }
    var dir = score > 1 ? 1 : score < -1 ? -1 : 0;
    return {
      dir: dir,
      label: dir === 1 ? 'Uptrend' : dir === -1 ? 'Downtrend' : 'Range / no clear trend',
      why: why, strength: Math.min(1, Math.abs(score) / 3.5), adx: adx
    };
  };

  /* Break of Structure (continuation) and Change of Character (first counter-trend break). */
  S.breaks = function (bars, strength) {
    var sw = S.swings(bars, strength || 2), events = [];
    var lastHigh = null, lastLow = null, bias = 0;
    var all = sw.highs.map(function (h) { return { k: 'H', s: h }; })
      .concat(sw.lows.map(function (l) { return { k: 'L', s: l }; }))
      .sort(function (a, b) { return a.s.confirmedAt - b.s.confirmedAt; });
    var ptr = 0;
    for (var i = 0; i < bars.length; i++) {
      while (ptr < all.length && all[ptr].s.confirmedAt <= i) {
        if (all[ptr].k === 'H') lastHigh = all[ptr].s; else lastLow = all[ptr].s;
        ptr++;
      }
      if (lastHigh && bars[i].c > lastHigh.price && lastHigh.i < i) {
        events.push({ i: i, type: bias < 0 ? 'CHoCH' : 'BOS', dir: 1, level: lastHigh.price, from: lastHigh.i, t: bars[i].t });
        bias = 1; lastHigh = null;
      } else if (lastLow && bars[i].c < lastLow.price && lastLow.i < i) {
        events.push({ i: i, type: bias > 0 ? 'CHoCH' : 'BOS', dir: -1, level: lastLow.price, from: lastLow.i, t: bars[i].t });
        bias = -1; lastLow = null;
      }
    }
    return events;
  };

  /* Fair value gaps / imbalances: 3-bar pattern where bar1 and bar3 do not overlap. */
  S.fvgs = function (bars, minAtrFrac) {
    var atr = TT.ind.atr(bars, 14), out = [];
    for (var i = 2; i < bars.length; i++) {
      var a = bars[i - 2], c = bars[i], size, gap = null;
      if (c.l > a.h) { size = c.l - a.h; gap = { dir: 1, lo: a.h, hi: c.l }; }
      else if (c.h < a.l) { size = a.l - c.h; gap = { dir: -1, lo: c.h, hi: a.l }; }
      if (!gap) continue;
      var ref = atr[i] || (c.h - c.l) || 1;
      if (size < ref * (minAtrFrac == null ? 0.18 : minAtrFrac)) continue;
      gap.i = i; gap.size = size; gap.t = bars[i].t; gap.filled = false; gap.filledAt = null;
      for (var j = i + 1; j < bars.length; j++) {
        if (gap.dir === 1 ? bars[j].l <= gap.lo : bars[j].h >= gap.hi) { gap.filled = true; gap.filledAt = j; break; }
      }
      out.push(gap);
    }
    return out;
  };

  /* Order blocks: last opposing candle before a displacement move that breaks structure. */
  S.orderBlocks = function (bars) {
    var atr = TT.ind.atr(bars, 14), out = [];
    for (var i = 1; i < bars.length - 1; i++) {
      var b = bars[i], nx = bars[i + 1], a = atr[i];
      if (!a) continue;
      var body = Math.abs(nx.c - nx.o);
      if (body < a * 1.1) continue;                       // require displacement
      if (nx.c > nx.o && b.c < b.o && nx.c > b.h) {       // bullish OB
        out.push({ i: i, dir: 1, lo: b.l, hi: b.h, t: b.t, displacement: body / a });
      } else if (nx.c < nx.o && b.c > b.o && nx.c < b.l) { // bearish OB
        out.push({ i: i, dir: -1, lo: b.l, hi: b.h, t: b.t, displacement: body / a });
      }
    }
    return out;
  };

  /* Liquidity sweeps / stop hunts: wick pierces a prior swing then closes back inside. */
  S.sweeps = function (bars, strength) {
    var sw = S.swings(bars, strength || 3), out = [];
    function scan(list, isHigh) {
      list.forEach(function (s) {
        for (var i = s.confirmedAt + 1; i < bars.length; i++) {
          var b = bars[i];
          if (isHigh && b.h > s.price && b.c < s.price) { out.push({ i: i, dir: -1, level: s.price, from: s.i, t: b.t, kind: 'Sell-side sweep of highs' }); return; }
          if (!isHigh && b.l < s.price && b.c > s.price) { out.push({ i: i, dir: 1, level: s.price, from: s.i, t: b.t, kind: 'Buy-side sweep of lows' }); return; }
          if (isHigh && b.c > s.price) return;
          if (!isHigh && b.c < s.price) return;
        }
      });
    }
    scan(sw.highs, true); scan(sw.lows, false);
    return out.sort(function (a, b) { return a.i - b.i; });
  };

  /* Horizontal support/resistance by clustering swing prices; more touches = stronger. */
  S.levels = function (bars, opts) {
    opts = opts || {};
    var sw = S.swings(bars, opts.strength || 2), atr = TT.ind.atr(bars, 14);
    var tol = (atr[bars.length - 1] || 1) * (opts.tolAtr || 0.6);
    var pts = sw.highs.map(function (h) { return { p: h.price, i: h.i, k: 'R' }; })
      .concat(sw.lows.map(function (l) { return { p: l.price, i: l.i, k: 'S' }; }))
      .sort(function (a, b) { return a.p - b.p; });
    var clusters = [], cur = null;
    pts.forEach(function (pt) {
      if (cur && Math.abs(pt.p - cur.sum / cur.n) <= tol) { cur.sum += pt.p; cur.n++; cur.last = Math.max(cur.last, pt.i); cur.pts.push(pt); }
      else { if (cur) clusters.push(cur); cur = { sum: pt.p, n: 1, last: pt.i, pts: [pt] }; }
    });
    if (cur) clusters.push(cur);
    var price = bars[bars.length - 1].c;
    return clusters.map(function (c) {
      return { price: c.sum / c.n, touches: c.n, lastIdx: c.last, side: (c.sum / c.n) > price ? 'resistance' : 'support' };
    }).filter(function (l) { return l.touches >= (opts.minTouches || 2); })
      .sort(function (a, b) { return Math.abs(a.price - price) - Math.abs(b.price - price); });
  };

  /* Nearest level in the direction a trade is heading — the "what's in the way" check. */
  S.nearestLevel = function (levels, price, dir) {
    var best = null;
    levels.forEach(function (l) {
      if (dir > 0 && l.price <= price) return;
      if (dir < 0 && l.price >= price) return;
      if (!best || Math.abs(l.price - price) < Math.abs(best.price - price)) best = l;
    });
    return best;
  };

  /* Consolidation / range detection — tight range then expansion is the classic setup. */
  S.range = function (bars, n) {
    n = n || 20;
    if (bars.length < n) return null;
    var win = bars.slice(-n), hi = -Infinity, lo = Infinity;
    win.forEach(function (b) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; });
    var atr = TT.ind.atr(bars, 14)[bars.length - 1] || 1;
    var height = hi - lo;
    return {
      hi: hi, lo: lo, mid: (hi + lo) / 2, height: height, atr: atr,
      tightness: height / (atr * n) ,                         // < ~0.35 is a coil
      isTight: height < atr * 4,
      pctOfPrice: height / bars[bars.length - 1].c * 100
    };
  };

  /* Opening range for intraday sessions (bars carry .off = minutes after 09:30). */
  S.openingRange = function (bars, minutes) {
    minutes = minutes || 15;
    var hi = -Infinity, lo = Infinity, count = 0;
    for (var i = 0; i < bars.length; i++) {
      if (bars[i].off == null || bars[i].off >= minutes) break;
      if (bars[i].h > hi) hi = bars[i].h;
      if (bars[i].l < lo) lo = bars[i].l;
      count++;
    }
    return count ? { hi: hi, lo: lo, mid: (hi + lo) / 2, bars: count, minutes: minutes } : null;
  };

  /* Gap vs prior session close. */
  S.gap = function (prevClose, open) {
    if (!prevClose) return null;
    var d = open - prevClose;
    return { abs: d, pct: d / prevClose * 100, dir: d > 0 ? 1 : d < 0 ? -1 : 0 };
  };

  /* Pullback depth of the current leg as a fibonacci fraction. */
  S.pullbackDepth = function (bars, sw) {
    sw = sw || S.swings(bars, 2);
    var h = sw.highs[sw.highs.length - 1], l = sw.lows[sw.lows.length - 1];
    if (!h || !l) return null;
    var price = bars[bars.length - 1].c;
    if (h.i > l.i) { // up leg from l to h
      var d = h.price - l.price;
      return d <= 0 ? null : { dir: 1, from: l.price, to: h.price, retrace: (h.price - price) / d };
    }
    var d2 = h.price - l.price;
    return d2 <= 0 ? null : { dir: -1, from: h.price, to: l.price, retrace: (price - l.price) / d2 };
  };

  /* One call that assembles the full structural picture for the coach and the chart. */
  S.analyze = function (bars, opts) {
    opts = opts || {};
    if (!bars || bars.length < 12) return null;
    var sw = S.swings(bars, opts.strength || 2);
    var res = {
      swings: sw,
      trend: S.trend(bars, sw),
      breaks: S.breaks(bars, opts.strength || 2),
      fvgs: S.fvgs(bars),
      orderBlocks: S.orderBlocks(bars),
      sweeps: S.sweeps(bars),
      levels: S.levels(bars, opts),
      range: S.range(bars, 20),
      pullback: S.pullbackDepth(bars, sw),
      volumeProfile: TT.ind.volumeProfile(bars, 24)
    };
    if (opts.intraday) res.openingRange = S.openingRange(bars, opts.orMinutes || 15);
    return res;
  };
})(window);
