// ========== INFINITY GRID BOT (server-side) ==========
// This is the SAME algorithm as the original browser app's InfinityGridBot
// class, moved here so it can run inside a process that stays alive on a
// server instead of inside a browser tab. Nothing about the trading logic
// itself has changed.

const FEE = 0.0005; // 0.05% per trade, same as before
const MAX_HISTORY = 500; // keep more history server-side since we're not limited by browser storage

function nowISO() {
  return new Date().toISOString();
}

class InfinityGridBot {
  constructor({ pair, investment, lowestPrice, gridPct, startPrice }) {
    this.pair = pair;
    this.investment = investment;
    this.lowestPrice = lowestPrice;
    this.gridPct = gridPct;
    this.startPrice = startPrice;
    this.fee = FEE;

    // Target Value (X) = Investment × (Lowest Price / Current Price)
    this.targetValue = investment * (lowestPrice / startPrice);
    // Buy base asset worth = Target Value; keep remaining USDT as reserve
    this.usdt = investment - this.targetValue;
    this.base = this.targetValue / startPrice;
    this.avgBuyPrice = startPrice;
    this.gridProfit = 0;
    this.totalFees = 0;
    this.tradeCount = 0;
    this.status = 'RUNNING';
    this.lastPrice = startPrice;
    this.lastTradePrice = startPrice;
    this.history = [{
      time: nowISO(),
      action: 'START',
      amount: investment,
      price: startPrice,
      base: this.base,
      usdt: this.usdt,
      baseValue: this.base * startPrice,
      gridProfit: 0,
      note: 'Bot created'
    }];
    this.createdAt = nowISO();
    this.updatedAt = nowISO();
  }

  // Identical decision logic to the browser version: while price is rising,
  // only sell excess above the target value; while price is falling, only
  // buy to refill toward the target value. This is what makes it an
  // "infinity grid" (no upper bound) instead of a fixed-range grid.
  rebalance(price, time) {
    time = time || nowISO();
    this.lastPrice = price;
    this.updatedAt = time;

    if (price < this.lowestPrice) {
      if (this.status === 'RUNNING') {
        this.status = 'STOPPED';
        this._log(time, 'STOP', 0, price, 'Below lowest price');
      }
      return 'STOPPED (below lowest)';
    }

    if (this.status === 'STOPPED' && price >= this.lowestPrice) {
      this.status = 'RUNNING';
      this._log(time, 'RESUME', 0, price, 'Resumed — price above lowest');
    }

    if (this.status !== 'RUNNING') return this.status;

    const baseVal = this.base * price;
    const threshold = this.gridPct / 100;

    // While price is rising → only SELL (never buy)
    if (price > this.lastTradePrice && baseVal > this.targetValue * (1 + threshold)) {
      const excess = baseVal - this.targetValue;
      const sellBase = excess / price;
      const feeAmt = excess * this.fee;
      const received = excess - feeAmt;
      const realized = received - sellBase * this.avgBuyPrice;
      this.gridProfit += realized;
      this.totalFees += feeAmt;
      this.base -= sellBase;
      this.usdt += received;
      this.tradeCount++;
      this.lastTradePrice = price;
      this._log(time, 'SELL', sellBase, price, 'Sold excess base');
      return 'SELL';
    }

    // While price is falling → only BUY (never sell)
    if (price < this.lastTradePrice && baseVal < this.targetValue * (1 - threshold) && this.usdt > 0.01) {
      const needed = this.targetValue - baseVal;
      const buyValue = Math.min(needed, this.usdt);
      const feeAmt = buyValue * this.fee;
      const net = buyValue - feeAmt;
      const buyBase = net / price;
      this.avgBuyPrice = (this.avgBuyPrice * this.base + buyValue) / (this.base + buyBase);
      this.base += buyBase;
      this.usdt -= buyValue;
      this.totalFees += feeAmt;
      this.tradeCount++;
      this.lastTradePrice = price;
      this._log(time, 'BUY', buyBase, price, 'Bought to reach target');
      return 'BUY';
    }

    return 'HOLD';
  }

  totalValue(p) { return this.base * p + this.usdt; }
  unrealizedPnl(p) { return (p - this.avgBuyPrice) * this.base; }
  totalProfit(p) { return this.gridProfit + this.unrealizedPnl(p); }

  nextTriggers(price) {
    const threshold = this.gridPct / 100;
    const sellPrice = this.base > 0 ? (this.targetValue * (1 + threshold)) / this.base : null;
    const buyPrice = this.base > 0 ? (this.targetValue * (1 - threshold)) / this.base : null;
    const hasUsdt = this.usdt > 0.01;
    const buyBelowStop = buyPrice !== null && buyPrice <= this.lowestPrice;
    return { sellPrice, buyPrice, hasUsdt, buyBelowStop };
  }

  _log(time, action, amount, price, note) {
    this.history.push({
      time, action,
      amount,
      price,
      base: this.base,
      usdt: this.usdt,
      baseValue: this.base * price,
      gridProfit: this.gridProfit,
      note
    });
    if (this.history.length > MAX_HISTORY) this.history = this.history.slice(-MAX_HISTORY);
  }

  toJSON() {
    const keys = ['pair', 'investment', 'lowestPrice', 'gridPct', 'startPrice', 'fee',
      'targetValue', 'usdt', 'base', 'avgBuyPrice', 'gridProfit', 'totalFees',
      'tradeCount', 'status', 'lastPrice', 'lastTradePrice', 'history', 'createdAt', 'updatedAt'];
    const o = {};
    keys.forEach(k => { o[k] = this[k]; });
    return o;
  }

  static fromJSON(o) {
    const bot = Object.create(InfinityGridBot.prototype);
    Object.assign(bot, o);
    if (!bot.history) bot.history = [];
    if (!bot.fee) bot.fee = FEE;
    if (bot.lastTradePrice === undefined) bot.lastTradePrice = bot.startPrice;
    return bot;
  }
}

module.exports = { InfinityGridBot, FEE };
