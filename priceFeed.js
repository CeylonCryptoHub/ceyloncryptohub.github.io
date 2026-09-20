// Live price feed from OKX — runs inside the Node process, not the browser.
// This is the whole point: as long as this process is alive (on your PC,
// a VPS, or a host like Render), it keeps streaming prices and feeding the
// bot, whether or not anyone has a browser tab open.

const WebSocket = require('ws');

const OKX_WS_URL = 'wss://ws.okx.com:8443/ws/v5/public';
const OKX_REST_TICKER = 'https://www.okx.com/api/v5/market/ticker';

const livePrices = {}; // instId -> { last, ts }
let ws = null;
let pingTimer = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
const wantedSubs = new Set();

function subscribe(instId) {
  wantedSubs.add(instId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'tickers', instId }] }));
  }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(OKX_WS_URL);

  ws.on('open', () => {
    reconnectDelay = 1000;
    console.log('[priceFeed] connected to OKX WebSocket');
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 20000);
    if (wantedSubs.size) {
      const args = Array.from(wantedSubs).map(id => ({ channel: 'tickers', instId: id }));
      ws.send(JSON.stringify({ op: 'subscribe', args }));
    }
  });

  ws.on('message', (data) => {
    const text = data.toString();
    if (text === 'pong') return;
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return; }
    if (msg.arg && msg.arg.channel === 'tickers' && msg.data && msg.data[0]) {
      const t = msg.data[0];
      livePrices[t.instId] = { last: parseFloat(t.last), ts: Date.now() };
    }
  });

  ws.on('close', () => {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    console.log('[priceFeed] disconnected, reconnecting in ' + reconnectDelay + 'ms');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[priceFeed] error:', err.message);
    if (ws) ws.close();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 15000);
}

async function fetchTickerRest(pair) {
  const url = OKX_REST_TICKER + '?instId=' + encodeURIComponent(pair);
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.data || !data.data[0]) throw new Error('No ticker data for ' + pair);
  return parseFloat(data.data[0].last);
}

// Returns a fresh live price (WebSocket tick if <5s old, otherwise REST).
async function getPrice(pair) {
  const cached = livePrices[pair];
  if (cached && Date.now() - cached.ts < 5000) return cached.last;
  return await fetchTickerRest(pair);
}

module.exports = { connect, subscribe, getPrice, fetchTickerRest };
