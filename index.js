const express = require('express');
const path = require('path');
const { InfinityGridBot } = require('./bot');
const store = require('./store');
const priceFeed = require('./priceFeed');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const LOOP_INTERVAL_MS = 1000; // same 1s cadence as the original browser app

let bot = null; // in-memory bot, mirrored to disk on every change

// ---- restore bot from disk on boot (survives restarts/redeploys) ----
const saved = store.loadState();
if (saved) {
  bot = InfinityGridBot.fromJSON(saved);
  console.log('[server] restored bot for', bot.pair, '— status:', bot.status);
  priceFeed.subscribe(bot.pair);
}

priceFeed.connect();

function serializeBot() {
  if (!bot) return null;
  const price = bot.lastPrice;
  return {
    ...bot.toJSON(),
    totalValue: bot.totalValue(price),
    unrealizedPnl: bot.unrealizedPnl(price),
    totalProfit: bot.totalProfit(price),
    nextTriggers: bot.nextTriggers(price)
  };
}

// ---- the always-on loop: this is what makes it behave like a real bot ----
// It runs inside this Node process on whatever machine/host you start it on.
// As long as THIS PROCESS keeps running, the bot keeps trading — completely
// independent of any browser tab being open.
let ticking = false;
setInterval(async () => {
  if (!bot || ticking) return;
  ticking = true;
  try {
    const price = await priceFeed.getPrice(bot.pair);
    const action = bot.rebalance(price);
    store.saveState(bot.toJSON());
    if (action === 'BUY' || action === 'SELL') {
      console.log('[bot] ' + action + ' @ ' + price + ' — value=' + bot.totalValue(price).toFixed(2));
    }
  } catch (e) {
    console.error('[bot] tick failed:', e.message);
  } finally {
    ticking = false;
  }
}, LOOP_INTERVAL_MS);

// ---- REST API ----

app.get('/api/bot', (req, res) => {
  res.json({ bot: serializeBot() });
});

app.post('/api/bot', async (req, res) => {
  try {
    if (bot) return res.status(400).json({ error: 'A bot already exists. Delete it first.' });
    const { pair, investment, lowestPrice, gridPct } = req.body;
    if (!pair || !investment || !lowestPrice || !gridPct) {
      return res.status(400).json({ error: 'pair, investment, lowestPrice and gridPct are required' });
    }
    const normalizedPair = String(pair).trim().toUpperCase().replace(/\//g, '-').replace(/_/g, '-');
    const finalPair = normalizedPair.includes('-') ? normalizedPair : normalizedPair + '-USDT';

    const startPrice = await priceFeed.getPrice(finalPair);
    if (Number(lowestPrice) >= startPrice) {
      return res.status(400).json({ error: 'Lowest price must be below the current price (' + startPrice + ')' });
    }

    bot = new InfinityGridBot({
      pair: finalPair,
      investment: Number(investment),
      lowestPrice: Number(lowestPrice),
      gridPct: Number(gridPct),
      startPrice
    });
    store.saveState(bot.toJSON());
    priceFeed.subscribe(finalPair);
    res.json({ bot: serializeBot() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/bot', (req, res) => {
  bot = null;
  store.clearState();
  res.json({ ok: true });
});

app.get('/api/price/:pair', async (req, res) => {
  try {
    const price = await priceFeed.getPrice(req.params.pair.toUpperCase());
    res.json({ pair: req.params.pair.toUpperCase(), price });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log('[server] Infinity Grid bot server listening on port ' + PORT);
  console.log('[server] This process must stay running 24/7 for the bot to keep trading.');
});
