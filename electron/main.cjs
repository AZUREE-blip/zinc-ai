/**
 * Zinc.ai — Headless Desktop Watcher
 *
 * Runs in the background with NO UI. Responsibilities:
 * - Screen watcher: monitors active window, uploads context to Moltbook Hub
 * - Moltbook bridge: REST/WS connection to the Hub
 *
 * The user-facing interface is now the Slack bot (server/slack-bot/).
 * Start with: npm run dev:watcher
 */

const { app } = require('electron');
const path = require('path');
const os = require('os');

// --- Modules ---
const initScreenWatcher = require('./screen-watcher.cjs');
const initMoltbookBridge = require('./moltbook-bridge.cjs');
const { initPrivacyConfig, getPrivacyConfig, savePrivacyConfig, getDefaultConfig } = require('./privacy-config.cjs');

// --- Electron Store ---
let Store, store;
try {
  Store = require('electron-store');
  store = new Store();
} catch (err) {
  console.error('electron-store failed:', err.message);
  store = { get: () => undefined, set: () => {}, delete: () => {} };
}

// --- Globals ---
let isQuitting = false;
const isDev = !app.isPackaged;

let screenWatcher = null;
let moltbookBridge = null;

// Fix cache permission issues on Windows
if (process.platform === 'win32') {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  try {
    const userCacheDir = path.join(os.homedir(), 'AppData', 'Local', 'zinc-electron');
    app.setPath('userData', userCacheDir);
  } catch (err) {
    console.log('Note: Using default cache location');
  }
}

// ============================================
// APP LIFECYCLE
// ============================================

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.whenReady().then(async () => {
    // Initialize privacy config with electron-store
    initPrivacyConfig(store);
    console.log('[PRIVACY] Privacy config initialized');

    // No window — headless mode
    const getOverlayWindow = () => null;
    const getStore = () => store;

    moltbookBridge = initMoltbookBridge({ getOverlayWindow, getStore });
    screenWatcher = initScreenWatcher({ getOverlayWindow, aiEngine: null, moltbookBridge });

    console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   Zinc.ai Desktop Watcher (headless)                       ║
║                                                            ║
║   Screen watcher:  active                                  ║
║   Moltbook bridge: connected                               ║
║   UI:              none (use Slack bot)                     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}

app.on('window-all-closed', () => {
  // Headless — no windows to close, keep running
});

app.on('before-quit', () => {
  isQuitting = true;
});

// ============================================
// RECALL.AI BOT (Meeting Bot Integration)
// ============================================

// Keep Recall.ai IPC for meeting bot management from desktop
const { ipcMain } = require('electron');

const RECALL_API_BASE = 'https://api.recall.ai/api/v1';

function getRecallApiKey() {
  const userKey = store.get('recallApiKey');
  return userKey || process.env.RECALL_AI_API_KEY || '';
}

async function recallApiCall(method, endpoint, body) {
  const apiKey = getRecallApiKey();
  if (!apiKey) throw new Error('Recall.ai API key not configured. Set it in Settings or .env.');

  const fetchModule = await import('node-fetch');
  const fetch = fetchModule.default;

  const response = await fetch(`${RECALL_API_BASE}${endpoint}`, {
    method,
    headers: { 'Authorization': `Token ${apiKey}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Recall.ai API error (${response.status}): ${errorText}`);
  }

  if (response.status === 204) return {};
  return response.json();
}

ipcMain.handle('recall-create-bot', async (event, config) => {
  try {
    const bot = await recallApiCall('POST', '/bot', {
      meeting_url: config.meetingUrl,
      bot_name: config.botName || 'Zinc Cat',
      automatic_leave: { waiting_room_timeout: 300, no_one_joined_timeout: 300, everyone_left_timeout: 30 },
    });
    return { success: true, bot };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('recall-get-bot-status', async (event, botId) => {
  try { return { success: true, bot: await recallApiCall('GET', `/bot/${botId}`) }; }
  catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('recall-stop-bot', async (event, botId) => {
  try { await recallApiCall('POST', `/bot/${botId}/leave`); return { success: true }; }
  catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('recall-get-recording', async (event, botId) => {
  try {
    const bot = await recallApiCall('GET', `/bot/${botId}`);
    return { success: true, recording: bot.video_url ? { mediaUrl: bot.video_url } : null };
  } catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('recall-get-transcript', async (event, botId) => {
  try { return { success: true, transcript: await recallApiCall('GET', `/bot/${botId}/transcript`) }; }
  catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('recall-list-active-bots', async () => {
  try {
    const result = await recallApiCall('GET', '/bot?status_ne=done&status_ne=fatal');
    return { success: true, bots: result.results || [] };
  } catch (error) { return { success: false, error: error.message }; }
});

// ============================================
// PRIVACY CONFIG IPC HANDLERS
// ============================================

ipcMain.handle('privacy-get-config', async () => {
  return getPrivacyConfig();
});

ipcMain.handle('privacy-save-config', async (event, updates) => {
  return savePrivacyConfig(updates);
});

ipcMain.handle('privacy-reset-config', async () => {
  return savePrivacyConfig(getDefaultConfig());
});

// ============================================

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
