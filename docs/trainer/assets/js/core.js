/* core.js — shared utilities, formatting, persistence.
   Trading Trainer is a simulator. Nothing here touches a real broker or real money. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};

  var U = TT.util = {
    clamp: function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    round: function (v, d) { var p = Math.pow(10, d == null ? 2 : d); return Math.round(v * p) / p; },
    sum: function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; },
    mean: function (a) { return a.length ? U.sum(a) / a.length : 0; },
    stdev: function (a) {
      if (a.length < 2) return 0;
      var m = U.mean(a), s = 0;
      for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
      return Math.sqrt(s / a.length);
    },
    money: function (v, d) {
      if (v == null || isNaN(v)) return '—';
      d = d == null ? 2 : d;
      var neg = v < 0, s = Math.abs(v).toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return (neg ? '-$' : '$') + s;
    },
    signed: function (v, d) {
      if (v == null || isNaN(v)) return '—';
      return (v > 0 ? '+' : '') + U.money(v, d).replace('$-', '-$');
    },
    pct: function (v, d) { return (v == null || isNaN(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(d == null ? 2 : d) + '%'; },
    num: function (v, d) { return (v == null || isNaN(v)) ? '—' : v.toFixed(d == null ? 2 : d); },
    vol: function (v) {
      if (v == null || isNaN(v)) return '—';
      if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
      if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
      return String(v);
    },
    pad: function (n) { return n < 10 ? '0' + n : String(n); },
    // minutes after 09:30 ET -> "10:45"
    sessionTime: function (off) {
      var m = 570 + off;
      return U.pad(Math.floor(m / 60)) + ':' + U.pad(m % 60);
    },
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    id: function (p) { return (p || 'id') + '_' + Math.random().toString(36).slice(2, 9); },
    debounce: function (fn, ms) {
      var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); };
    }
  };

  // ---- persistence (per-browser only; nothing leaves the machine) ----
  var NS = 'tt_trainer_v1:';
  TT.store = {
    get: function (k, dflt) {
      try {
        var v = w.localStorage.getItem(NS + k);
        return v == null ? dflt : JSON.parse(v);
      } catch (e) { return dflt; }
    },
    set: function (k, v) {
      try { w.localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) { try { w.localStorage.removeItem(NS + k); } catch (e) {} },
    clearAll: function () {
      try {
        var keys = [];
        for (var i = 0; i < w.localStorage.length; i++) {
          var k = w.localStorage.key(i);
          if (k && k.indexOf(NS) === 0) keys.push(k);
        }
        keys.forEach(function (k) { w.localStorage.removeItem(k); });
      } catch (e) {}
    }
  };

  // ---- tiny DOM helpers ----
  TT.dom = {
    $: function (sel, root) { return (root || document).querySelector(sel); },
    $$: function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); },
    el: function (tag, attrs, html) {
      var e = document.createElement(tag);
      if (attrs) for (var k in attrs) {
        if (k === 'class') e.className = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
      if (html != null) e.innerHTML = html;
      return e;
    }
  };

  TT.toast = function (msg, kind, ms) {
    var box = document.getElementById('toasts');
    if (!box) return;
    var t = TT.dom.el('div', { class: 'toast ' + (kind || '') }, msg);
    box.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s'; t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 260);
    }, ms || 3800);
  };
})(window);
