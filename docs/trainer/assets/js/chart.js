/* chart.js — dependency-free candlestick canvas with overlays, structure annotations,
   trade markers and one indicator sub-pane. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};
  var U = TT.util;

  function Chart(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.bars = [];
    this.view = { from: 0, to: 0 };
    this.overlays = {};
    this.marks = [];
    this.lines = [];
    this.boxes = [];
    this.labels = [];
    this.subPane = 'volume';
    this.hover = null;
    this.pad = { l: 8, r: 66, t: 10, b: 20 };
    this._bind();
  }

  Chart.prototype._bind = function () {
    var self = this;
    this.cv.addEventListener('mousemove', function (e) {
      var r = self.cv.getBoundingClientRect();
      var x = e.clientX - r.left, y = e.clientY - r.top;
      self.hover = { x: x, y: y, i: self.indexAt(x) };
      self.draw();
      if (self.opts.onHover) self.opts.onHover(self.bars[self.hover.i], self.hover.i);
    });
    this.cv.addEventListener('mouseleave', function () {
      self.hover = null; self.draw();
      if (self.opts.onHover) self.opts.onHover(null, -1);
    });
    this.cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      var span = self.view.to - self.view.from;
      var delta = e.deltaY > 0 ? Math.ceil(span * 0.12) : -Math.ceil(span * 0.12);
      var ns = U.clamp(span + delta, 20, self.bars.length);
      self.view.from = U.clamp(self.view.to - ns, 0, Math.max(0, self.view.to - 20));
      self.draw();
    }, { passive: false });
    w.addEventListener('resize', U.debounce(function () { self.resize(); }, 120));
  };

  Chart.prototype.resize = function () {
    var dpr = w.devicePixelRatio || 1;
    var rect = this.cv.getBoundingClientRect();
    this.cv.width = Math.max(320, rect.width) * dpr;
    this.cv.height = Math.max(240, rect.height) * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.W = Math.max(320, rect.width); this.H = Math.max(240, rect.height);
    this.draw();
  };

  Chart.prototype.setData = function (bars, visible) {
    this.bars = bars || [];
    var vis = visible || this.opts.visible || 120;
    this.view.to = this.bars.length;
    this.view.from = Math.max(0, this.bars.length - vis);
    if (!this.W) this.resize(); else this.draw();
  };

  Chart.prototype.follow = function (keepSpan) {
    var span = keepSpan || (this.view.to - this.view.from) || 120;
    this.view.to = this.bars.length;
    this.view.from = Math.max(0, this.view.to - span);
  };

  Chart.prototype.plotArea = function () {
    var subH = this.subPane === 'none' ? 0 : (this.subPane === 'volume' ? 62 : 84);
    return {
      x: this.pad.l, y: this.pad.t,
      w: this.W - this.pad.l - this.pad.r,
      h: this.H - this.pad.t - this.pad.b - subH - (subH ? 8 : 0),
      subY: this.H - this.pad.b - subH, subH: subH
    };
  };

  Chart.prototype.scales = function () {
    var a = this.plotArea(), from = this.view.from, to = this.view.to;
    var hi = -Infinity, lo = Infinity;
    for (var i = from; i < to; i++) {
      var b = this.bars[i]; if (!b) continue;
      if (b.h > hi) hi = b.h; if (b.l < lo) lo = b.l;
    }
    // include overlay series so lines never clip off-screen
    var self = this;
    Object.keys(this.overlays).forEach(function (k) {
      var ov = self.overlays[k];
      if (!ov || !ov.data || ov.noScale) return;
      for (var i = from; i < to; i++) {
        var v = ov.data[i];
        if (v == null || isNaN(v)) continue;
        if (v > hi) hi = v; if (v < lo) lo = v;
      }
    });
    this.lines.forEach(function (l) {
      if (l.price == null || l.noScale) return;
      if (l.price > hi) hi = l.price; if (l.price < lo) lo = l.price;
    });
    if (!isFinite(hi) || !isFinite(lo)) { hi = 100; lo = 99; }
    var pad = (hi - lo) * 0.08 || 1;
    hi += pad; lo -= pad;
    var n = Math.max(1, to - from), cw = a.w / n;
    return {
      a: a, hi: hi, lo: lo, cw: cw,
      x: function (i) { return a.x + (i - from + 0.5) * cw; },
      y: function (p) { return a.y + (hi - p) / (hi - lo) * a.h; },
      pAt: function (yy) { return hi - (yy - a.y) / a.h * (hi - lo); }
    };
  };

  Chart.prototype.indexAt = function (x) {
    var a = this.plotArea(), n = Math.max(1, this.view.to - this.view.from);
    var cw = a.w / n;
    return U.clamp(Math.floor((x - a.x) / cw) + this.view.from, 0, Math.max(0, this.bars.length - 1));
  };

  var COL = {
    bg: '#10161f', grid: 'rgba(35,48,67,.55)', text: '#6c7f97', text2: '#9fb0c6',
    up: '#26a96a', dn: '#e05260', upw: '#2fbf7c', dnw: '#ef6672'
  };

  Chart.prototype.draw = function () {
    if (!this.W) { this.resize(); return; }
    var ctx = this.ctx, s = this.scales(), a = s.a, self = this;
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, this.W, this.H);

    // --- grid + price axis ---
    ctx.font = '10px ui-monospace,Menlo,monospace';
    ctx.strokeStyle = COL.grid; ctx.fillStyle = COL.text; ctx.lineWidth = 1;
    var steps = 6;
    for (var g = 0; g <= steps; g++) {
      var p = s.lo + (s.hi - s.lo) * g / steps, yy = Math.round(s.y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(a.x, yy); ctx.lineTo(a.x + a.w, yy); ctx.stroke();
      ctx.textAlign = 'left'; ctx.fillText(p.toFixed(2), a.x + a.w + 6, yy + 3);
    }

    // --- boxes (FVG / order blocks / ranges) ---
    this.boxes.forEach(function (b) {
      if (b.to < self.view.from || b.from > self.view.to) return;
      var x1 = s.x(Math.max(b.from, self.view.from)) - s.cw / 2;
      var x2 = s.x(Math.min(b.to, self.view.to - 1)) + s.cw / 2;
      ctx.fillStyle = b.fill; ctx.fillRect(x1, s.y(b.hi), Math.max(2, x2 - x1), Math.max(1, s.y(b.lo) - s.y(b.hi)));
      if (b.stroke) { ctx.strokeStyle = b.stroke; ctx.strokeRect(x1, s.y(b.hi), Math.max(2, x2 - x1), Math.max(1, s.y(b.lo) - s.y(b.hi))); }
      if (b.label) {
        ctx.fillStyle = b.textColor || 'rgba(230,237,246,.75)';
        ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
        ctx.fillText(b.label, x1 + 3, s.y(b.hi) + 10);
      }
    });

    // --- session dividers (intraday: makes the overnight boundary obvious) ---
    (this.dividers || []).forEach(function (d) {
      if (d.i < self.view.from || d.i >= self.view.to) return;
      var X = Math.round(s.x(d.i) - s.cw / 2) + 0.5;
      ctx.strokeStyle = 'rgba(159,176,198,.22)'; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X, a.y); ctx.lineTo(X, a.y + a.h); ctx.stroke(); ctx.setLineDash([]);
      if (d.label) {
        ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.fillStyle = 'rgba(159,176,198,.6)'; ctx.textAlign = 'left';
        ctx.fillText(d.label, X + 3, a.y + 10);
      }
    });

    // --- candles ---
    var bw = Math.max(1, Math.min(s.cw * 0.68, 16));
    for (var i = this.view.from; i < this.view.to; i++) {
      var b = this.bars[i]; if (!b) continue;
      var x = s.x(i), up = b.c >= b.o;
      ctx.strokeStyle = up ? COL.upw : COL.dnw;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, s.y(b.h)); ctx.lineTo(Math.round(x) + 0.5, s.y(b.l)); ctx.stroke();
      var yo = s.y(b.o), yc = s.y(b.c), top = Math.min(yo, yc), hgt = Math.max(1, Math.abs(yc - yo));
      ctx.fillStyle = up ? COL.up : COL.dn;
      ctx.fillRect(x - bw / 2, top, bw, hgt);
    }

    // --- overlays ---
    Object.keys(this.overlays).forEach(function (k) {
      var ov = self.overlays[k];
      if (!ov || !ov.data) return;
      ctx.strokeStyle = ov.color; ctx.lineWidth = ov.width || 1.4;
      if (ov.dash) ctx.setLineDash(ov.dash);
      ctx.beginPath();
      var started = false;
      for (var i = self.view.from; i < self.view.to; i++) {
        var v = ov.data[i];
        if (v == null || isNaN(v)) { started = false; continue; }
        var X = s.x(i), Y = s.y(v);
        if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      if (ov.fillTo && self.overlays[ov.fillTo]) {
        var other = self.overlays[ov.fillTo].data;
        ctx.beginPath(); var open = false;
        for (var j = self.view.from; j < self.view.to; j++) {
          if (ov.data[j] == null || other[j] == null) continue;
          if (!open) { ctx.moveTo(s.x(j), s.y(ov.data[j])); open = true; } else ctx.lineTo(s.x(j), s.y(ov.data[j]));
        }
        for (var m = self.view.to - 1; m >= self.view.from; m--) {
          if (ov.data[m] == null || other[m] == null) continue;
          ctx.lineTo(s.x(m), s.y(other[m]));
        }
        ctx.closePath(); ctx.fillStyle = ov.fillColor || 'rgba(76,154,255,.06)'; ctx.fill();
      }
    });

    // --- horizontal lines (levels, SL/TP, pivots, VWAP anchors) ---
    this.lines.forEach(function (l) {
      var yy = Math.round(s.y(l.price)) + 0.5;
      if (yy < a.y - 4 || yy > a.y + a.h + 4) return;
      ctx.strokeStyle = l.color; ctx.lineWidth = l.width || 1;
      ctx.setLineDash(l.dash || [4, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, yy); ctx.lineTo(a.x + a.w, yy); ctx.stroke();
      ctx.setLineDash([]);
      if (l.label) {
        ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'right';
        var tw = ctx.measureText(l.label).width + 8;
        ctx.fillStyle = l.bg || 'rgba(16,22,31,.9)';
        ctx.fillRect(a.x + a.w - tw, yy - 7, tw, 13);
        ctx.fillStyle = l.color; ctx.fillText(l.label, a.x + a.w - 4, yy + 3);
      }
    });

    // --- diagonal / structure segments ---
    (this.segments || []).forEach(function (sg) {
      ctx.strokeStyle = sg.color; ctx.lineWidth = sg.width || 1.2;
      if (sg.dash) ctx.setLineDash(sg.dash);
      ctx.beginPath(); ctx.moveTo(s.x(sg.i1), s.y(sg.p1)); ctx.lineTo(s.x(sg.i2), s.y(sg.p2)); ctx.stroke();
      ctx.setLineDash([]);
      if (sg.label) {
        ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left'; ctx.fillStyle = sg.color;
        ctx.fillText(sg.label, s.x(sg.i2) + 3, s.y(sg.p2) - 3);
      }
    });

    // --- trade markers ---
    this.marks.forEach(function (m) {
      if (m.i < self.view.from || m.i >= self.view.to) return;
      var X = s.x(m.i), Y = s.y(m.price);
      ctx.fillStyle = m.color; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      var r = 6;
      if (m.shape === 'up') { ctx.moveTo(X, Y - r); ctx.lineTo(X + r, Y + r); ctx.lineTo(X - r, Y + r); }
      else if (m.shape === 'down') { ctx.moveTo(X, Y + r); ctx.lineTo(X + r, Y - r); ctx.lineTo(X - r, Y - r); }
      else { ctx.arc(X, Y, r - 1, 0, Math.PI * 2); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (m.label) {
        ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.fillStyle = m.color; ctx.textAlign = 'center';
        ctx.fillText(m.label, X, m.shape === 'down' ? Y - r - 4 : Y + r + 10);
      }
    });

    // --- text labels pinned to bars (swing H/L, BOS) ---
    this.labels.forEach(function (t) {
      if (t.i < self.view.from || t.i >= self.view.to) return;
      ctx.font = (t.size || 9) + 'px ui-monospace,Menlo,monospace';
      ctx.fillStyle = t.color; ctx.textAlign = 'center';
      ctx.fillText(t.text, s.x(t.i), s.y(t.price) + (t.dy || 0));
    });

    // --- sub pane ---
    if (this.subPane !== 'none') this._drawSub(s);

    // --- crosshair ---
    if (this.hover && this.hover.x > a.x && this.hover.x < a.x + a.w) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(159,176,198,.45)'; ctx.lineWidth = 1;
      var hx = Math.round(s.x(this.hover.i)) + 0.5;
      ctx.beginPath(); ctx.moveTo(hx, a.y); ctx.lineTo(hx, a.y + a.h); ctx.stroke();
      if (this.hover.y < a.y + a.h) {
        ctx.beginPath(); ctx.moveTo(a.x, Math.round(this.hover.y) + 0.5); ctx.lineTo(a.x + a.w, Math.round(this.hover.y) + 0.5); ctx.stroke();
        ctx.setLineDash([]);
        var pr = s.pAt(this.hover.y);
        ctx.fillStyle = 'rgba(76,154,255,.92)'; ctx.fillRect(a.x + a.w, this.hover.y - 8, this.pad.r - 2, 15);
        ctx.fillStyle = '#04101f'; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
        ctx.fillText(pr.toFixed(2), a.x + a.w + 5, this.hover.y + 3);
      }
      ctx.setLineDash([]);
    }

    // --- last price tag ---
    var lastIdx = this.view.to - 1, last = this.bars[lastIdx];
    if (last) {
      var ly = s.y(last.c), upLast = last.c >= last.o;
      ctx.setLineDash([2, 3]); ctx.strokeStyle = upLast ? COL.up : COL.dn;
      ctx.beginPath(); ctx.moveTo(a.x, ly); ctx.lineTo(a.x + a.w, ly); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = upLast ? COL.up : COL.dn;
      ctx.fillRect(a.x + a.w, ly - 8, this.pad.r - 2, 15);
      ctx.fillStyle = '#04101f'; ctx.font = 'bold 10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'left';
      ctx.fillText(last.c.toFixed(2), a.x + a.w + 5, ly + 3);
    }

    // --- x axis labels ---
    ctx.fillStyle = COL.text; ctx.font = '10px ui-monospace,Menlo,monospace'; ctx.textAlign = 'center';
    var every = Math.max(1, Math.round((this.view.to - this.view.from) / 8));
    for (var xi = this.view.from; xi < this.view.to; xi++) {
      if ((xi - this.view.from) % every !== 0) continue;
      var bb = this.bars[xi]; if (!bb) continue;
      ctx.fillText(bb.label || bb.t || '', s.x(xi), this.H - 6);
    }
  };

  Chart.prototype._drawSub = function (s) {
    var ctx = this.ctx, a = s.a, y0 = a.subY, h = a.subH, self = this;
    ctx.strokeStyle = COL.grid;
    ctx.beginPath(); ctx.moveTo(a.x, y0 + 0.5); ctx.lineTo(a.x + a.w, y0 + 0.5); ctx.stroke();
    ctx.font = '9px ui-monospace,Menlo,monospace'; ctx.fillStyle = COL.text; ctx.textAlign = 'left';

    if (this.subPane === 'volume') {
      var maxV = 0;
      for (var i = this.view.from; i < this.view.to; i++) if (this.bars[i] && this.bars[i].v > maxV) maxV = this.bars[i].v;
      if (!maxV) return;
      var bw = Math.max(1, Math.min(s.cw * 0.68, 16));
      for (var j = this.view.from; j < this.view.to; j++) {
        var b = this.bars[j]; if (!b) continue;
        var bh = (b.v / maxV) * (h - 12);
        ctx.fillStyle = b.c >= b.o ? 'rgba(38,169,106,.55)' : 'rgba(224,82,96,.55)';
        ctx.fillRect(s.x(j) - bw / 2, y0 + h - bh, bw, bh);
      }
      var vAvg = TT.ind.sma(this.bars.map(function (b) { return b.v; }), 20);
      ctx.strokeStyle = 'rgba(224,166,58,.85)'; ctx.lineWidth = 1; ctx.beginPath();
      var st = false;
      for (var k = this.view.from; k < this.view.to; k++) {
        if (vAvg[k] == null) { st = false; continue; }
        var Y = y0 + h - (vAvg[k] / maxV) * (h - 12);
        if (!st) { ctx.moveTo(s.x(k), Y); st = true; } else ctx.lineTo(s.x(k), Y);
      }
      ctx.stroke();
      ctx.fillStyle = COL.text; ctx.fillText('Volume (20-bar avg in amber)', a.x + 3, y0 + 10);
      return;
    }

    var series = this.subSeries || [], lo = this.subRange ? this.subRange[0] : Infinity, hi = this.subRange ? this.subRange[1] : -Infinity;
    if (!this.subRange) {
      series.forEach(function (sr) {
        for (var i = self.view.from; i < self.view.to; i++) {
          var v = sr.data[i]; if (v == null || isNaN(v)) continue;
          if (v > hi) hi = v; if (v < lo) lo = v;
        }
      });
      if (!isFinite(hi)) { hi = 1; lo = 0; }
      var pd = (hi - lo) * 0.1 || 1; hi += pd; lo -= pd;
    }
    function sy(v) { return y0 + h - (v - lo) / (hi - lo) * (h - 4) - 2; }
    (this.subGuides || []).forEach(function (g) {
      var Y = Math.round(sy(g.v)) + 0.5;
      ctx.strokeStyle = g.color || 'rgba(35,48,67,.9)'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(a.x, Y); ctx.lineTo(a.x + a.w, Y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.text; ctx.textAlign = 'left'; ctx.fillText(String(g.v), a.x + a.w + 4, Y + 3);
    });
    series.forEach(function (sr) {
      if (sr.type === 'hist') {
        for (var i = self.view.from; i < self.view.to; i++) {
          var v = sr.data[i]; if (v == null) continue;
          var zero = sy(0), Y = sy(v);
          ctx.fillStyle = v >= 0 ? 'rgba(38,169,106,.6)' : 'rgba(224,82,96,.6)';
          ctx.fillRect(s.x(i) - Math.max(1, s.cw * 0.3), Math.min(zero, Y), Math.max(1, s.cw * 0.6), Math.abs(zero - Y) || 1);
        }
        return;
      }
      ctx.strokeStyle = sr.color; ctx.lineWidth = sr.width || 1.3; ctx.beginPath();
      var started = false;
      for (var j = self.view.from; j < self.view.to; j++) {
        var v2 = sr.data[j];
        if (v2 == null || isNaN(v2)) { started = false; continue; }
        if (!started) { ctx.moveTo(s.x(j), sy(v2)); started = true; } else ctx.lineTo(s.x(j), sy(v2));
      }
      ctx.stroke();
    });
    ctx.fillStyle = COL.text; ctx.textAlign = 'left';
    ctx.fillText(this.subLabel || this.subPane.toUpperCase(), a.x + 3, y0 + 10);
  };

  Chart.prototype.clearAnnotations = function () {
    this.marks = []; this.lines = []; this.boxes = []; this.labels = []; this.segments = []; this.dividers = [];
  };

  TT.Chart = Chart;
})(window);
