// Tiny file-based persistence. Good enough for a single paper-trading bot.
// State lives on disk in ./data/state.json, so restarting the server
// (redeploys, crashes, host reboots) does NOT lose the bot's progress —
// only actually deleting the bot does.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDir();
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('[store] failed to load state, starting fresh:', e.message);
    return null;
  }
}

function saveState(state) {
  ensureDir();
  const tmpFile = STATE_FILE + '.tmp';
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state));
    fs.renameSync(tmpFile, STATE_FILE); // atomic on the same filesystem
  } catch (e) {
    console.error('[store] failed to save state:', e.message);
  }
}

function clearState() {
  ensureDir();
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch (e) {
    console.error('[store] failed to clear state:', e.message);
  }
}

module.exports = { loadState, saveState, clearState };
