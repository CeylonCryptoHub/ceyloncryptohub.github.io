# Infinity Grid Bot — Always-On Server (Paper Trading)

This replaces the browser-only simulator. The trading logic now runs inside
a **Node.js process**, not inside a browser tab — so it keeps trading 24/7
as long as that process is running, exactly like a real exchange bot (Pionex,
etc.). Closing your browser only closes the *dashboard view*; the bot itself
keeps running on the server.

No real money is used — this is still 100% paper trading, just running
continuously and correctly instead of "catching up" after the fact.

## What's different from the old version

| | Old (browser-only) | New (this project) |
|---|---|---|
| Where the bot logic runs | Your browser tab | A Node.js server process |
| What happens when you close the browser | Bot stops completely | Bot keeps trading |
| How it "catches up" | Replays 15m candles after reopening | It never falls behind — no catch-up needed |
| Where state is stored | Browser `localStorage` | A JSON file on the server (`data/state.json`) |

## 1. Run it locally first (to test)

Requires [Node.js](https://nodejs.org) 18 or newer.

```bash
cd infinity-grid-server
npm install
npm start
```

Then open **http://localhost:3000** in your browser. Create a bot — it will
keep trading even if you close that browser tab, as long as you leave the
`npm start` terminal running.

Stopping the terminal (Ctrl+C) stops the bot, same as unplugging Pionex's
server would stop your bot there. To get true 24/7 uptime without keeping
your own PC on, deploy it to a free host (below).

## 2. Deploy for free so it runs 24/7 without your PC (Render)

[Render](https://render.com) has a free tier that's simplest for this kind
of always-on Node app.

1. Push this folder to a GitHub repo (or use Render's "public Git repo" or
   direct upload option).
2. On Render: **New → Web Service** → connect the repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Deploy. Render gives you a public URL like `https://your-bot.onrender.com`
   — open that instead of localhost.

**Important free-tier caveat:** Render's free web services "spin down" after
about 15 minutes with no incoming web traffic, which pauses the whole
process (including the trading loop) until the next request wakes it back
up. Two ways to avoid that:
- Use a free uptime pinger (e.g. [UptimeRobot](https://uptimerobot.com)) to
  hit your Render URL every 5–10 minutes, keeping it awake 24/7.
- Or use a host without that sleep behavior, such as a small always-on VPS
  (e.g. Oracle Cloud's free tier, or a cheap $4–5/mo VPS) — more reliable if
  you want guaranteed 24/7 trading.

## 3. Files

- `index.js` — Express server + the always-on 1-second trading loop
- `bot.js` — the grid bot algorithm (unchanged from the original browser app)
- `priceFeed.js` — live OKX price feed (WebSocket, REST fallback)
- `store.js` — saves bot state to `data/state.json` so restarts don't lose progress
- `public/index.html` — simple dashboard that polls the server every second

## 4. API (in case you want to build your own frontend)

- `GET /api/bot` — current bot state + computed metrics
- `POST /api/bot` — create a bot `{ pair, investment, lowestPrice, gridPct }`
- `DELETE /api/bot` — delete the current bot
- `GET /api/price/:pair` — live price for any OKX pair
