/* indicators.js — every calculation the trainer draws or grades with.
   Bars are objects: {t, o, h, l, c, v} (t = label). Arrays are index-aligned with
   nulls in the warm-up region so a value at index i is ALWAYS the value as of bar i.
   Nothing here peeks at future bars — that is the whole point of a replay trainer. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};
  var IND = TT.ind = {};

  function pick(bars, f) { return bars.map(f); }
  var C = function (b) { return b.c; }, H = function (b) { return b.h; },
      L = function (b) { return b.l; }, V = function (b) { return b.v; };
  IND.closes = function (b) { return pick(b, C); };

  IND.sma = function (src, n) {
    var out = new Array(src.length), s = 0;
    for (var i = 0; i < src.length; i++) {
      s += src[i];
      if (i >= n) s -= src[i - n];
      out[i] = i >= n - 1 ? s / n : null;
    }
    return out;
  };

  IND.ema = function (src, n) {
    var out = new Array(src.length), k = 2 / (n + 1), prev = null, seed = 0;
    for (var i = 0; i < src.length; i++) {
      if (i < n - 1) { seed += src[i]; out[i] = null; continue; }
      if (i === n - 1) { seed += src[i]; prev = seed / n; out[i] = prev; continue; }
      prev = src[i] * k + prev * (1 - k); out[i] = prev;
    }
    return out;
  };

  IND.wma = function (src, n) {
    var out = new Array(src.length), denom = n * (n + 1) / 2;
    for (var i = 0; i < src.length; i++) {
      if (i < n - 1) { out[i] = null; continue; }
      var s = 0;
      for (var j = 0; j < n; j++) s += src[i - n + 1 + j] * (j + 1);
      out[i] = s / denom;
    }
    return out;
  };

  IND.rma = function (src, n) { // Wilder smoothing
    var out = new Array(src.length), prev = null, seed = 0;
    for (var i = 0; i < src.length; i++) {
      var x = src[i] == null ? 0 : src[i];
      if (i < n - 1) { seed += x; out[i] = null; continue; }
      if (i === n - 1) { seed += x; prev = seed / n; out[i] = prev; continue; }
      prev = (prev * (n - 1) + x) / n; out[i] = prev;
    }
    return out;
  };

  IND.trueRange = function (bars) {
    return bars.map(function (b, i) {
      if (i === 0) return b.h - b.l;
      var p = bars[i - 1].c;
      return Math.max(b.h - b.l, Math.abs(b.h - p), Math.abs(b.l - p));
    });
  };
  IND.atr = function (bars, n) { return IND.rma(IND.trueRange(bars), n || 14); };

  IND.rsi = function (src, n) {
    n = n || 14;
    var gains = [], losses = [];
    for (var i = 0; i < src.length; i++) {
      if (i === 0) { gains.push(0); losses.push(0); continue; }
      var d = src[i] - src[i - 1];
      gains.push(d > 0 ? d : 0); losses.push(d < 0 ? -d : 0);
    }
    var ag = IND.rma(gains, n), al = IND.rma(losses, n);
    return src.map(function (_, i) {
      if (ag[i] == null || al[i] == null) return null;
      if (al[i] === 0) return 100;
      var rs = ag[i] / al[i];
      return 100 - 100 / (1 + rs);
    });
  };

  IND.macd = function (src, fast, slow, sig) {
    fast = fast || 12; slow = slow || 26; sig = sig || 9;
    var f = IND.ema(src, fast), s = IND.ema(src, slow);
    var line = src.map(function (_, i) { return (f[i] == null || s[i] == null) ? null : f[i] - s[i]; });
    var compact = line.filter(function (x) { return x != null; });
    var sigC = IND.ema(compact, sig);
    var offset = line.length - compact.length, signal = new Array(line.length);
    for (var i = 0; i < line.length; i++) signal[i] = i < offset ? null : sigC[i - offset];
    var hist = line.map(function (x, i) { return (x == null || signal[i] == null) ? null : x - signal[i]; });
    return { line: line, signal: signal, hist: hist };
  };

  IND.bollinger = function (src, n, mult) {
    n = n || 20; mult = mult || 2;
    var mid = IND.sma(src, n), up = [], lo = [], bw = [];
    for (var i = 0; i < src.length; i++) {
      if (mid[i] == null) { up.push(null); lo.push(null); bw.push(null); continue; }
      var sd = TT.util.stdev(src.slice(i - n + 1, i + 1));
      up.push(mid[i] + mult * sd); lo.push(mid[i] - mult * sd);
      bw.push(mid[i] ? (2 * mult * sd) / mid[i] * 100 : null);
    }
    return { mid: mid, upper: up, lower: lo, width: bw };
  };

  IND.keltner = function (bars, n, mult) {
    n = n || 20; mult = mult || 1.5;
    var mid = IND.ema(IND.closes(bars), n), a = IND.atr(bars, n);
    return {
      mid: mid,
      upper: mid.map(function (m, i) { return (m == null || a[i] == null) ? null : m + mult * a[i]; }),
      lower: mid.map(function (m, i) { return (m == null || a[i] == null) ? null : m - mult * a[i]; })
    };
  };

  IND.stochastic = function (bars, kN, kSmooth, dN) {
    kN = kN || 14; kSmooth = kSmooth || 3; dN = dN || 3;
    var raw = bars.map(function (b, i) {
      if (i < kN - 1) return null;
      var hi = -Infinity, lo = Infinity;
      for (var j = i - kN + 1; j <= i; j++) { if (bars[j].h > hi) hi = bars[j].h; if (bars[j].l < lo) lo = bars[j].l; }
      return hi === lo ? 50 : (b.c - lo) / (hi - lo) * 100;
    });
    var k = smoothNullable(raw, kSmooth), d = smoothNullable(k, dN);
    return { k: k, d: d };
  };
  function smoothNullable(src, n) {
    return src.map(function (_, i) {
      var acc = [], ok = true;
      for (var j = i - n + 1; j <= i; j++) { if (j < 0 || src[j] == null) { ok = false; break; } acc.push(src[j]); }
      return ok ? TT.util.mean(acc) : null;
    });
  }
  IND.smoothNullable = smoothNullable;

  IND.williamsR = function (bars, n) {
    n = n || 14;
    return bars.map(function (b, i) {
      if (i < n - 1) return null;
      var hi = -Infinity, lo = Infinity;
      for (var j = i - n + 1; j <= i; j++) { if (bars[j].h > hi) hi = bars[j].h; if (bars[j].l < lo) lo = bars[j].l; }
      return hi === lo ? -50 : (hi - b.c) / (hi - lo) * -100;
    });
  };

  IND.cci = function (bars, n) {
    n = n || 20;
    var tp = bars.map(function (b) { return (b.h + b.l + b.c) / 3; }), ma = IND.sma(tp, n);
    return tp.map(function (x, i) {
      if (ma[i] == null) return null;
      var win = tp.slice(i - n + 1, i + 1), md = 0;
      for (var j = 0; j < win.length; j++) md += Math.abs(win[j] - ma[i]);
      md /= n;
      return md === 0 ? 0 : (x - ma[i]) / (0.015 * md);
    });
  };

  IND.adx = function (bars, n) {
    n = n || 14;
    var plusDM = [], minusDM = [];
    for (var i = 0; i < bars.length; i++) {
      if (i === 0) { plusDM.push(0); minusDM.push(0); continue; }
      var up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
      plusDM.push(up > dn && up > 0 ? up : 0);
      minusDM.push(dn > up && dn > 0 ? dn : 0);
    }
    var tr = IND.rma(IND.trueRange(bars), n), pdm = IND.rma(plusDM, n), mdm = IND.rma(minusDM, n);
    var pdi = [], mdi = [], dx = [];
    for (var j = 0; j < bars.length; j++) {
      if (tr[j] == null || !tr[j]) { pdi.push(null); mdi.push(null); dx.push(null); continue; }
      var p = 100 * pdm[j] / tr[j], m = 100 * mdm[j] / tr[j];
      pdi.push(p); mdi.push(m);
      dx.push((p + m) === 0 ? 0 : 100 * Math.abs(p - m) / (p + m));
    }
    return { plusDI: pdi, minusDI: mdi, adx: IND.rma(dx, n) };
  };

  IND.obv = function (bars) {
    var out = [], acc = 0;
    for (var i = 0; i < bars.length; i++) {
      if (i > 0) acc += bars[i].c > bars[i - 1].c ? bars[i].v : bars[i].c < bars[i - 1].c ? -bars[i].v : 0;
      out.push(acc);
    }
    return out;
  };

  IND.mfi = function (bars, n) {
    n = n || 14;
    var tp = bars.map(function (b) { return (b.h + b.l + b.c) / 3; });
    return bars.map(function (_, i) {
      if (i < n) return null;
      var pos = 0, neg = 0;
      for (var j = i - n + 1; j <= i; j++) {
        var flow = tp[j] * bars[j].v;
        if (tp[j] > tp[j - 1]) pos += flow; else if (tp[j] < tp[j - 1]) neg += flow;
      }
      if (neg === 0) return 100;
      return 100 - 100 / (1 + pos / neg);
    });
  };

  IND.roc = function (src, n) {
    n = n || 9;
    return src.map(function (x, i) { return i < n || !src[i - n] ? null : (x - src[i - n]) / src[i - n] * 100; });
  };

  IND.vwap = function (bars, resetFn) {
    var pv = 0, vv = 0;
    return bars.map(function (b, i) {
      if (resetFn && resetFn(b, i, bars)) { pv = 0; vv = 0; }
      var tp = (b.h + b.l + b.c) / 3;
      pv += tp * b.v; vv += b.v;
      return vv ? pv / vv : b.c;
    });
  };

  // VWAP anchored at an arbitrary index, plus standard-deviation bands.
  IND.anchoredVwap = function (bars, startIdx, bandMult) {
    var pv = 0, vv = 0, sqAcc = 0, line = [], up = [], lo = [];
    for (var i = 0; i < bars.length; i++) {
      if (i < startIdx) { line.push(null); up.push(null); lo.push(null); continue; }
      var b = bars[i], tp = (b.h + b.l + b.c) / 3;
      pv += tp * b.v; vv += b.v; sqAcc += tp * tp * b.v;
      var v = vv ? pv / vv : b.c;
      var varr = vv ? Math.max(0, sqAcc / vv - v * v) : 0, sd = Math.sqrt(varr);
      line.push(v); up.push(v + (bandMult || 1) * sd); lo.push(v - (bandMult || 1) * sd);
    }
    return { vwap: line, upper: up, lower: lo };
  };

  IND.supertrend = function (bars, n, mult) {
    n = n || 10; mult = mult || 3;
    var a = IND.atr(bars, n), dir = [], line = [], prevUp = null, prevDn = null, prevDir = 1;
    for (var i = 0; i < bars.length; i++) {
      if (a[i] == null) { dir.push(null); line.push(null); continue; }
      var mid = (bars[i].h + bars[i].l) / 2, up = mid + mult * a[i], dn = mid - mult * a[i], c = bars[i].c;
      if (prevUp != null) up = (c > prevUp) ? up : Math.min(up, prevUp);
      if (prevDn != null) dn = (c < prevDn) ? dn : Math.max(dn, prevDn);
      var d = prevDir;
      if (prevUp != null && c > prevUp) d = 1; else if (prevDn != null && c < prevDn) d = -1;
      dir.push(d); line.push(d === 1 ? dn : up);
      prevUp = up; prevDn = dn; prevDir = d;
    }
    return { dir: dir, line: line };
  };

  IND.psar = function (bars, step, max) {
    step = step || 0.02; max = max || 0.2;
    var out = [], bull = true, af = step, ep = bars.length ? bars[0].h : 0, sar = bars.length ? bars[0].l : 0;
    for (var i = 0; i < bars.length; i++) {
      if (i === 0) { out.push(null); continue; }
      sar = sar + af * (ep - sar);
      if (bull) {
        if (bars[i].l < sar) { bull = false; sar = ep; ep = bars[i].l; af = step; }
        else if (bars[i].h > ep) { ep = bars[i].h; af = Math.min(max, af + step); }
      } else {
        if (bars[i].h > sar) { bull = true; sar = ep; ep = bars[i].h; af = step; }
        else if (bars[i].l < ep) { ep = bars[i].l; af = Math.min(max, af + step); }
      }
      out.push(sar);
    }
    return out;
  };

  IND.donchian = function (bars, n) {
    n = n || 20;
    var up = [], lo = [], mid = [];
    for (var i = 0; i < bars.length; i++) {
      if (i < n) { up.push(null); lo.push(null); mid.push(null); continue; }
      var hi = -Infinity, low = Infinity;
      for (var j = i - n; j < i; j++) { if (bars[j].h > hi) hi = bars[j].h; if (bars[j].l < low) low = bars[j].l; }
      up.push(hi); lo.push(low); mid.push((hi + low) / 2);
    }
    return { upper: up, lower: lo, mid: mid };
  };

  IND.ichimoku = function (bars) {
    function mid(i, n) {
      if (i < n - 1) return null;
      var hi = -Infinity, lo = Infinity;
      for (var j = i - n + 1; j <= i; j++) { if (bars[j].h > hi) hi = bars[j].h; if (bars[j].l < lo) lo = bars[j].l; }
      return (hi + lo) / 2;
    }
    var tenkan = bars.map(function (_, i) { return mid(i, 9); });
    var kijun = bars.map(function (_, i) { return mid(i, 26); });
    var spanA = bars.map(function (_, i) { return (tenkan[i] == null || kijun[i] == null) ? null : (tenkan[i] + kijun[i]) / 2; });
    var spanB = bars.map(function (_, i) { return mid(i, 52); });
    return { tenkan: tenkan, kijun: kijun, spanA: spanA, spanB: spanB };
  };

  // Relative volume vs same-index average of prior sessions / prior n bars.
  IND.rvol = function (bars, n) {
    n = n || 20;
    var vols = bars.map(V), avg = IND.sma(vols, n);
    return vols.map(function (v, i) { return avg[i] ? v / avg[i] : null; });
  };

  IND.vwma = function (bars, n) {
    n = n || 20;
    return bars.map(function (_, i) {
      if (i < n - 1) return null;
      var pv = 0, vv = 0;
      for (var j = i - n + 1; j <= i; j++) { pv += bars[j].c * bars[j].v; vv += bars[j].v; }
      return vv ? pv / vv : null;
    });
  };

  // Classic floor-trader pivots from a completed prior period.
  IND.pivots = function (h, l, c) {
    var p = (h + l + c) / 3, r = h - l;
    return {
      P: p, R1: 2 * p - l, S1: 2 * p - h, R2: p + r, S2: p - r,
      R3: h + 2 * (p - l), S3: l - 2 * (h - p)
    };
  };

  IND.fib = function (lo, hi) {
    var d = hi - lo;
    return {
      '0%': hi, '23.6%': hi - d * 0.236, '38.2%': hi - d * 0.382, '50%': hi - d * 0.5,
      '61.8%': hi - d * 0.618, '78.6%': hi - d * 0.786, '100%': lo,
      ext127: hi + d * 0.272, ext161: hi + d * 0.618
    };
  };

  // Volume-by-price: point of control + 70% value area.
  IND.volumeProfile = function (bars, buckets) {
    if (!bars.length) return null;
    buckets = buckets || 24;
    var hi = -Infinity, lo = Infinity;
    bars.forEach(function (b) { if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l; });
    if (hi === lo) return null;
    var step = (hi - lo) / buckets, rows = new Array(buckets).fill(0);
    bars.forEach(function (b) {
      var a = Math.floor((b.l - lo) / step), z = Math.floor((b.h - lo) / step);
      a = TT.util.clamp(a, 0, buckets - 1); z = TT.util.clamp(z, 0, buckets - 1);
      var span = z - a + 1, per = b.v / span;
      for (var i = a; i <= z; i++) rows[i] += per;
    });
    var total = TT.util.sum(rows), poc = 0;
    for (var i = 1; i < rows.length; i++) if (rows[i] > rows[poc]) poc = i;
    var acc = rows[poc], up = poc, dn = poc;
    while (acc < total * 0.7 && (up < buckets - 1 || dn > 0)) {
      var a = up < buckets - 1 ? rows[up + 1] : -1, b = dn > 0 ? rows[dn - 1] : -1;
      if (a >= b) { up++; acc += rows[up]; } else { dn--; acc += rows[dn]; }
    }
    return {
      lo: lo, hi: hi, step: step, rows: rows, total: total,
      poc: lo + (poc + 0.5) * step, vah: lo + (up + 1) * step, val: lo + dn * step
    };
  };

  /* Evaluate every indicator the coach needs, as of the last bar of `bars`. */
  IND.snapshot = function (bars, opts) {
    opts = opts || {};
    var n = bars.length;
    if (!n) return null;
    var c = IND.closes(bars), last = bars[n - 1];
    var ema9 = IND.ema(c, 9), ema20 = IND.ema(c, 20), ema50 = IND.ema(c, 50), ema200 = IND.ema(c, 200);
    var sma50 = IND.sma(c, 50), sma200 = IND.sma(c, 200);
    var atr = IND.atr(bars, 14), rsi = IND.rsi(c, 14), macd = IND.macd(c), bb = IND.bollinger(c, 20, 2);
    var adx = IND.adx(bars, 14), st = IND.stochastic(bars), rvol = IND.rvol(bars, 20);
    var vwap = opts.vwapReset ? IND.vwap(bars, opts.vwapReset) : (opts.intraday ? IND.vwap(bars) : null);
    var i = n - 1;
    return {
      i: i, bar: last, price: last.c,
      ema9: ema9[i], ema20: ema20[i], ema50: ema50[i], ema200: ema200[i],
      sma50: sma50[i], sma200: sma200[i],
      atr: atr[i], atrPct: atr[i] && last.c ? atr[i] / last.c * 100 : null,
      rsi: rsi[i], macd: macd.line[i], macdSignal: macd.signal[i], macdHist: macd.hist[i],
      bbUpper: bb.upper[i], bbLower: bb.lower[i], bbMid: bb.mid[i], bbWidth: bb.width[i],
      adx: adx.adx[i], plusDI: adx.plusDI[i], minusDI: adx.minusDI[i],
      stochK: st.k[i], stochD: st.d[i], rvol: rvol[i], vwap: vwap ? vwap[i] : null,
      series: { ema9: ema9, ema20: ema20, ema50: ema50, ema200: ema200, atr: atr, rsi: rsi, vwap: vwap, macd: macd, bb: bb, adx: adx }
    };
  };
})(window);
