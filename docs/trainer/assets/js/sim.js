/* sim.js — the paper-trading engine.
   SIMULATION ONLY: no broker, no routing, no real money, no live quotes.
   Fills are modelled against real historical OHLC bars with an explicit, conservative
   set of assumptions that are printed in the UI so the user knows what is idealised. */
(function (w) {
  'use strict';
  var TT = w.TT = w.TT || {};
  var U = TT.util;

  var DEFAULTS = {
    startBalance: 2000,
    riskPct: 1,               // % of equity risked per trade (coaching baseline)
    slippageBps: 1,           // 0.01% on market/stop fills — a crude stand-in for spread + latency
    commission: 0,            // most US brokers are $0 commission on stock
    stopFirstWhenAmbiguous: true,
    shortingAllowed: true,
    forceFlatAtSessionEnd: true
  };

  function Sim(cfg) {
    this.cfg = Object.assign({}, DEFAULTS, cfg || {});
    this.reset(this.cfg.startBalance);
  }

  Sim.prototype.reset = function (balance) {
    this.startBalance = balance != null ? balance : this.cfg.startBalance;
    this.cash = this.startBalance;
    this.realized = 0;
    this.fees = 0;
    this.position = null;
    this.orders = [];
    this.trades = [];
    this.equityCurve = [];
    this.peakEquity = this.startBalance;
    this.maxDD = 0;
    this.log = [];
    this.cursor = -1;
  };

  Sim.prototype.load = function (ds, warmupBars) {
    this.ds = ds;                         // {symbol, timeframe, bars, label, intraday, sessions}
    this.bars = ds.bars;
    this.cursor = Math.min(this.bars.length - 1, Math.max(5, warmupBars == null ? 60 : warmupBars));
    this.position = null;
    this.orders = [];
    this.equityCurve = [{ i: this.cursor, equity: this.equity() }];
  };

  Sim.prototype.visible = function () { return this.bars.slice(0, this.cursor + 1); };
  Sim.prototype.last = function () { return this.bars[this.cursor]; };
  Sim.prototype.price = function () { var b = this.last(); return b ? b.c : 0; };
  Sim.prototype.atEnd = function () { return this.cursor >= this.bars.length - 1; };

  Sim.prototype.unrealized = function (px) {
    if (!this.position) return 0;
    var p = px == null ? this.price() : px;
    return (p - this.position.avg) * this.position.qty * (this.position.side === 'long' ? 1 : -1);
  };
  Sim.prototype.equity = function (px) { return this.cash + this.realized + this.unrealized(px); };
  Sim.prototype.openRisk = function () {
    var p = this.position;
    if (!p || !p.stop) return 0;
    return Math.abs(p.avg - p.stop) * p.qty;
  };

  function slip(price, bps, dir) { return price * (1 + dir * (bps / 10000)); }

  /* ---------- sizing ---------- */
  Sim.prototype.sizeByRisk = function (entry, stop, riskPct) {
    var risk = this.equity() * ((riskPct == null ? this.cfg.riskPct : riskPct) / 100);
    var per = Math.abs(entry - stop);
    if (!per) return 0;
    return Math.max(0, Math.floor(risk / per));
  };
  Sim.prototype.maxAffordable = function (entry) {
    return entry > 0 ? Math.floor(this.equity() / entry) : 0;
  };
  /* What a risk-based size WANTS vs what a small cash account can actually buy.
     The gap between the two is the single most common blocker for a $2k account. */
  Sim.prototype.suggestSize = function (entry, stop, riskPct) {
    var want = this.sizeByRisk(entry, stop, riskPct);
    var afford = this.maxAffordable(entry);
    var qty = Math.min(want, afford);
    var per = Math.abs(entry - stop);
    return {
      riskQty: want, affordableQty: afford, qty: qty,
      capped: want > afford,
      riskDollars: per * qty,
      riskPctActual: this.equity() ? (per * qty) / this.equity() * 100 : 0,
      notional: entry * qty,
      perShareRisk: per
    };
  };

  /* ---------- orders ---------- */
  Sim.prototype.marketOrder = function (side, qty, stop, target, meta) {
    if (!qty || qty <= 0) return { ok: false, msg: 'Quantity must be greater than zero.' };
    if (side === 'short' && !this.cfg.shortingAllowed) return { ok: false, msg: 'Shorting disabled in settings.' };
    var raw = this.price();
    var fill = slip(raw, this.cfg.slippageBps, side === 'long' ? 1 : -1);
    meta = meta || {};
    meta.slipCost = Math.abs(fill - raw);
    meta.quotedPrice = raw;
    return this._fill(side, qty, fill, stop, target, meta, 'market');
  };

  Sim.prototype.pendingOrder = function (o) {
    o.id = U.id('ord');
    o.status = 'working';
    o.placedAt = this.cursor;
    this.orders.push(o);
    return o;
  };
  Sim.prototype.cancelOrder = function (id) {
    this.orders = this.orders.filter(function (o) { return o.id !== id; });
  };

  Sim.prototype._fill = function (side, qty, price, stop, target, meta, how) {
    var notional = price * qty;
    var pos = this.position;
    // opposite-side order closes/reduces first
    if (pos && pos.side !== side) {
      var closeQty = Math.min(qty, pos.qty);
      this._close(closeQty, price, how === 'market' ? 'Manual close' : how);
      qty -= closeQty;
      if (qty <= 0) return { ok: true, closed: true };
      pos = this.position;
    }
    if (!pos) {
      if (side === 'long' && notional > this.equity() * 1.0001) {
        return { ok: false, msg: 'Not enough paper buying power (cash account rules: no margin in this trainer).' };
      }
      this.position = {
        side: side, qty: qty, avg: price, stop: stop || null, target: target || null,
        entryIdx: this.cursor, entryPrice: price, entryTime: this.last().label || this.last().t,
        openedAt: Date.now(), meta: meta || {}, scaleIns: [{ i: this.cursor, qty: qty, price: price }],
        initialStop: stop || null, initialTarget: target || null, initialQty: qty,
        mfe: 0, mae: 0, feesPaid: 0
      };
    } else {
      var newQty = pos.qty + qty;
      pos.avg = (pos.avg * pos.qty + price * qty) / newQty;
      pos.qty = newQty;
      pos.scaleIns.push({ i: this.cursor, qty: qty, price: price });
      if (stop) pos.stop = stop;
      if (target) pos.target = target;
    }
    var fee = this.cfg.commission;
    this.fees += fee; this.realized -= fee;
    if (this.position) this.position.feesPaid += fee;
    this.log.push({ i: this.cursor, msg: (side === 'long' ? 'BUY ' : 'SELL SHORT ') + qty + ' @ ' + price.toFixed(2) });
    return { ok: true, price: price, qty: qty };
  };

  Sim.prototype._close = function (qty, price, reason, exitIdx) {
    var p = this.position;
    if (!p) return null;
    qty = Math.min(qty, p.qty);
    var dir = p.side === 'long' ? 1 : -1;
    var pnl = (price - p.avg) * qty * dir;
    this.realized += pnl - this.cfg.commission;
    this.fees += this.cfg.commission;
    var idx = exitIdx == null ? this.cursor : exitIdx;

    var partial = qty < p.qty;
    var excursion = this._excursions(p.entryIdx, idx, p.avg, dir);
    var rPer = p.initialStop ? Math.abs(p.avg - p.initialStop) : null;
    var trade = {
      id: U.id('trd'),
      symbol: this.ds.symbol, timeframe: this.ds.timeframe,
      side: p.side, qty: qty, entryIdx: p.entryIdx, exitIdx: idx,
      entry: p.avg, exit: price, entryTime: p.entryTime, exitTime: (this.bars[idx].label || this.bars[idx].t),
      stop: p.initialStop, target: p.initialTarget, movedStop: p.stop !== p.initialStop ? p.stop : null,
      pnl: pnl - this.cfg.commission, fees: this.cfg.commission,
      pnlPct: p.avg ? (price - p.avg) / p.avg * 100 * dir : 0,
      reason: reason, partial: partial,
      barsHeld: idx - p.entryIdx,
      riskPerShare: rPer,
      plannedR: (rPer && p.initialTarget) ? Math.abs(p.initialTarget - p.avg) / rPer : null,
      realizedR: rPer ? ((price - p.avg) * dir) / rPer : null,
      mfe: excursion.mfe, mae: excursion.mae,
      mfeR: rPer ? excursion.mfe / rPer : null,
      maeR: rPer ? excursion.mae / rPer : null,
      riskDollars: rPer ? rPer * p.initialQty : null,
      riskPctOfEquity: rPer ? (rPer * p.initialQty) / (this.startBalance + this.realized - pnl || this.startBalance) * 100 : null,
      notional: p.avg * p.initialQty,
      strategy: (p.meta && p.meta.strategy) || null,
      slipCost: (p.meta && p.meta.slipCost != null) ? p.meta.slipCost : null,
      quoted: (p.meta && p.meta.quotedPrice != null) ? p.meta.quotedPrice : null,
      entrySnapshot: (p.meta && p.meta.snapshot) || null,
      entryNote: (p.meta && p.meta.note) || '',
      scaleIns: p.scaleIns.slice(),
      openedAtISO: new Date(p.openedAt).toISOString()
    };
    this.trades.push(trade);
    this.log.push({ i: idx, msg: (p.side === 'long' ? 'SELL ' : 'COVER ') + qty + ' @ ' + price.toFixed(2) + ' (' + reason + ') ' + U.signed(trade.pnl) });

    if (partial) { p.qty -= qty; } else { this.position = null; }
    return trade;
  };

  Sim.prototype._excursions = function (fromIdx, toIdx, entry, dir) {
    var mfe = 0, mae = 0;
    for (var i = fromIdx; i <= toIdx && i < this.bars.length; i++) {
      var b = this.bars[i];
      var up = (b.h - entry) * dir, dn = (b.l - entry) * dir;
      var best = dir === 1 ? (b.h - entry) : (entry - b.l);
      var worst = dir === 1 ? (entry - b.l) : (b.h - entry);
      if (best > mfe) mfe = best;
      if (worst > mae) mae = worst;
    }
    return { mfe: mfe, mae: mae };
  };

  Sim.prototype.closeAll = function (reason) {
    if (!this.position) return null;
    var px = slip(this.price(), this.cfg.slippageBps, this.position.side === 'long' ? -1 : 1);
    return this._close(this.position.qty, px, reason || 'Manual close');
  };

  Sim.prototype.modifyStop = function (price) { if (this.position) this.position.stop = price; };
  Sim.prototype.modifyTarget = function (price) { if (this.position) this.position.target = price; };

  /* ---------- time ---------- */
  Sim.prototype.step = function () {
    if (this.atEnd()) return { done: true };
    this.cursor++;
    var bar = this.bars[this.cursor], events = [];

    // 1) working orders
    var self = this, still = [];
    this.orders.forEach(function (o) {
      var hit = false, fillPx = null;
      if (o.type === 'limit') {
        if (o.side === 'long' && bar.l <= o.price) { hit = true; fillPx = Math.min(o.price, bar.o); }
        if (o.side === 'short' && bar.h >= o.price) { hit = true; fillPx = Math.max(o.price, bar.o); }
      } else if (o.type === 'stop') {   // stop entry (breakout)
        if (o.side === 'long' && bar.h >= o.price) { hit = true; fillPx = slip(Math.max(o.price, bar.o), self.cfg.slippageBps, 1); }
        if (o.side === 'short' && bar.l <= o.price) { hit = true; fillPx = slip(Math.min(o.price, bar.o), self.cfg.slippageBps, -1); }
      }
      if (hit) {
        self._fill(o.side, o.qty, fillPx, o.stop, o.target, o.meta, o.type);
        events.push({ type: 'entry', order: o, price: fillPx });
      } else still.push(o);
    });
    this.orders = still;

    // 2) stop loss / take profit against this bar
    var p = this.position;
    if (p) {
      var dir = p.side === 'long' ? 1 : -1;
      var stopHit = p.stop && (dir === 1 ? bar.l <= p.stop : bar.h >= p.stop);
      var tgtHit = p.target && (dir === 1 ? bar.h >= p.target : bar.l <= p.target);
      if (stopHit && tgtHit) {
        // Both inside one bar. Without tick data we cannot know the order, so the trainer
        // assumes the STOP filled first. Real life is a coin flip you do not control.
        if (this.cfg.stopFirstWhenAmbiguous) tgtHit = false; else stopHit = false;
        events.push({ type: 'ambiguous' });
      }
      if (stopHit) {
        var sp = slip(dir === 1 ? Math.min(p.stop, bar.o) : Math.max(p.stop, bar.o), this.cfg.slippageBps, dir === 1 ? -1 : 1);
        var t1 = this._close(p.qty, sp, 'Stop loss');
        events.push({ type: 'stop', trade: t1 });
      } else if (tgtHit) {
        var tp = dir === 1 ? Math.max(p.target, bar.o) : Math.min(p.target, bar.o);
        var t2 = this._close(p.qty, tp, 'Take profit');
        events.push({ type: 'target', trade: t2 });
      }
    }

    // 3) session boundary (day-trading discipline: flat by the close)
    if (this.ds.intraday && this.cfg.forceFlatAtSessionEnd) {
      var nxt = this.bars[this.cursor + 1];
      var endOfSession = !nxt || (nxt.day && bar.day && nxt.day !== bar.day);
      if (endOfSession && this.position) {
        var t3 = this._close(this.position.qty, bar.c, 'Closed at session end (no overnight risk)');
        events.push({ type: 'sessionClose', trade: t3 });
      }
      if (endOfSession && this.orders.length) { this.orders = []; events.push({ type: 'ordersExpired' }); }
    }

    // 4) equity bookkeeping
    var eq = this.equity();
    this.equityCurve.push({ i: this.cursor, equity: eq });
    if (eq > this.peakEquity) this.peakEquity = eq;
    var dd = this.peakEquity ? (this.peakEquity - eq) / this.peakEquity * 100 : 0;
    if (dd > this.maxDD) this.maxDD = dd;

    return { done: this.atEnd(), events: events, bar: bar };
  };

  /* ---------- performance ---------- */
  Sim.prototype.stats = function () {
    var t = this.trades, wins = [], losses = [], rs = [];
    t.forEach(function (x) {
      if (x.pnl > 0) wins.push(x.pnl); else if (x.pnl < 0) losses.push(x.pnl);
      if (x.realizedR != null) rs.push(x.realizedR);
    });
    var grossW = U.sum(wins), grossL = Math.abs(U.sum(losses));
    var eq = this.equity();
    var winRate = t.length ? wins.length / t.length * 100 : 0;
    var avgWin = wins.length ? grossW / wins.length : 0;
    var avgLoss = losses.length ? grossL / losses.length : 0;
    var streak = 0, best = 0, worstStreak = 0, cur = 0;
    t.forEach(function (x) {
      if (x.pnl > 0) { cur = cur >= 0 ? cur + 1 : 1; if (cur > best) best = cur; }
      else if (x.pnl < 0) { cur = cur <= 0 ? cur - 1 : -1; if (cur < worstStreak) worstStreak = cur; }
      streak = cur;
    });
    return {
      trades: t.length, wins: wins.length, losses: losses.length,
      winRate: winRate, avgWin: avgWin, avgLoss: avgLoss,
      payoff: avgLoss ? avgWin / avgLoss : null,
      profitFactor: grossL ? grossW / grossL : (grossW ? Infinity : null),
      expectancy: t.length ? (grossW - grossL) / t.length : 0,
      expectancyR: rs.length ? U.mean(rs) : null,
      totalPnl: this.realized,
      totalPnlPct: this.startBalance ? this.realized / this.startBalance * 100 : 0,
      equity: eq, maxDD: this.maxDD, fees: this.fees,
      streak: streak, bestStreak: best, worstStreak: Math.abs(worstStreak),
      avgBarsHeld: t.length ? U.mean(t.map(function (x) { return x.barsHeld; })) : 0,
      avgRiskPct: t.length ? U.mean(t.filter(function (x) { return x.riskPctOfEquity != null; }).map(function (x) { return x.riskPctOfEquity; }) || [0]) : 0
    };
  };

  TT.Sim = Sim;
  TT.SIM_DEFAULTS = DEFAULTS;
})(window);
