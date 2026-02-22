/**
 * Moltbook Bridge — Widget ↔ Moltbook Hub connection
 *
 * Handles:
 * - Connect to Moltbook Hub (REST + WebSocket)
 * - Upload YOUR screen context (screen-watcher data → hub)
 * - Search knowledge (Ask AI queries hub for company context)
 * - Receive suggestions (from OTHER people's data routed to you)
 * - Record outcomes (learning loop)
 *
 * Each person runs their own bridge. You upload YOUR data.
 * Moltbook routes OTHER people's data to you as suggestions.
 * You never get notifications from your own uploads.
 */

const { ipcMain } = require('electron');

// --- State ---
let ws = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 1000;

let hubConfig = null; // { hubUrl, companyId, userId, userEmail }

// --- Dependencies (set by init) ---
let getOverlayWindow = () => null;
let getStore = () => ({ get: () => undefined, set: () => {} });

// ============================================
// HTTP HELPERS
// ============================================

async function hubFetch(method, endpoint, body) {
  if (!hubConfig) throw new Error('Moltbook not configured. Set hub URL in Settings.');

  const fetchModule = await import('node-fetch');
  const fetch = fetchModule.default;

  const response = await fetch(`${hubConfig.hubUrl}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hub API error (${response.status}): ${errorText}`);
  }

  if (response.status === 204) return {};
  return response.json();
}

// ============================================
// HUB CONNECTION
// ============================================

async function connect() {
  if (!hubConfig) return false;

  try {
    // Authenticate with hub
    const authResult = await hubFetch('POST', '/api/agents/connect', {
      email: hubConfig.userEmail,
      companyId: hubConfig.companyId,
    });

    if (!authResult) {
      console.error('Failed to authenticate with Moltbook Hub');
      return false;
    }

    // Establish WebSocket
    await connectWebSocket();
    return true;
  } catch (error) {
    console.error('Failed to connect to Moltbook Hub:', error.message);
    return false;
  }
}

async function disconnect() {
  if (ws) {
    ws.close();
    ws = null;
  }

  try {
    if (hubConfig) {
      await hubFetch('POST', '/api/agents/disconnect', { userId: hubConfig.userId });
    }
  } catch { /* ignore */ }

  isConnected = false;
  notifyConnectionChange(false);
}

async function connectWebSocket() {
  return new Promise((resolve, reject) => {
    if (!hubConfig) return reject(new Error('No hub config'));

    const wsUrl = hubConfig.hubUrl.replace(/^http/, 'ws') + '/ws';

    try {
      // Use ws package in Node.js (Electron main process)
      const WebSocket = require('ws');
      ws = new WebSocket(wsUrl);
    } catch (err) {
      // Fallback: try global WebSocket
      if (typeof WebSocket !== 'undefined') {
        ws = new WebSocket(wsUrl);
      } else {
        return reject(new Error('No WebSocket implementation available'));
      }
    }

    ws.on('open', () => {
      console.log('WebSocket connected to Moltbook Hub');
      isConnected = true;
      reconnectAttempts = 0;
      notifyConnectionChange(true);

      // Send identity
      ws.send(JSON.stringify({
        type: 'identify',
        payload: { userId: hubConfig.userId, companyId: hubConfig.companyId },
      }));

      resolve();
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleWebSocketMessage(message);
      } catch { /* ignore malformed messages */ }
    });

    ws.on('close', () => {
      console.log('WebSocket disconnected from Moltbook Hub');
      isConnected = false;
      notifyConnectionChange(false);
      attemptReconnect();
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error.message);
      reject(error);
    });
  });
}

function handleWebSocketMessage(message) {
  const overlay = getOverlayWindow();

  switch (message.type) {
    case 'suggestion':
      // New suggestion from ANOTHER person's data routed to you
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('moltbook-suggestion', message.payload);
      }
      break;

    case 'knowledge_update':
      // Knowledge base updated
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('moltbook-knowledge-update', message.payload);
      }
      break;

    case 'user_online':
    case 'user_offline':
      if (overlay && !overlay.isDestroyed()) {
        overlay.webContents.send('moltbook-user-status', {
          type: message.type,
          ...message.payload,
        });
      }
      break;

    case 'pong':
      break;

    default:
      console.log('Unknown Moltbook message:', message.type);
  }
}

function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnect attempts reached for Moltbook Hub');
    return;
  }

  reconnectAttempts++;
  const delay = BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
  console.log(`Reconnecting to Moltbook in ${delay}ms (attempt ${reconnectAttempts})`);

  setTimeout(() => {
    connectWebSocket().catch(() => {
      // Will trigger another reconnect via onclose
    });
  }, delay);
}

function notifyConnectionChange(connected) {
  const overlay = getOverlayWindow();
  if (overlay && !overlay.isDestroyed()) {
    overlay.webContents.send('moltbook-connection-changed', { connected });
  }
}

// ============================================
// PUBLIC API (called by other modules)
// ============================================

/**
 * Upload YOUR screen context to Moltbook for routing to others.
 * Called automatically by screen-watcher on meaningful context changes.
 */
async function uploadContext(context) {
  if (!hubConfig || !isConnected) return null;

  // --- PRIVACY GATE 3: Second-pass PII Redaction (safety net) ---
  // Even if screen-watcher missed something, redact here before HTTP POST
  const privacyFilter = require('./privacy-filter.cjs');
  const sanitized = {
    ...context,
    summary: privacyFilter.redactSensitiveData(context.summary),
    keywords: Array.isArray(context.keywords)
      ? context.keywords.map(k => privacyFilter.redactSensitiveData(k))
      : context.keywords,
    windowTitle: privacyFilter.redactSensitiveData(context.windowTitle),
    url: privacyFilter.redactSensitiveData(context.url),
    observationText: privacyFilter.redactSensitiveData(context.observationText),
    subject: privacyFilter.redactSensitiveData(context.subject),
  };

  try {
    return await hubFetch('POST', '/api/context/upload', {
      ...sanitized,
      companyId: hubConfig.companyId,
      userId: hubConfig.userId,
    });
  } catch (err) {
    console.error('Context upload failed:', err.message);
    return null;
  }
}

/**
 * Search knowledge base for Ask AI context enrichment.
 * Called by ai-engine before generating AI responses.
 */
async function searchKnowledge(keywords, actionType) {
  if (!hubConfig) return [];

  try {
    const data = await hubFetch('POST', '/api/knowledge/search', {
      companyId: hubConfig.companyId,
      keywords,
      actionType,
    });
    return data.results || [];
  } catch (err) {
    console.error('Knowledge search failed:', err.message);
    return [];
  }
}

/**
 * Record outcome when user accepts/declines a suggestion.
 */
async function recordOutcome(suggestionId, action, wasSuccessful, editedText, feedback) {
  if (!hubConfig) return;

  try {
    await hubFetch('POST', '/api/outcomes/record', {
      suggestionId,
      companyId: hubConfig.companyId,
      userId: hubConfig.userId,
      action,
      wasSuccessful,
      editedText,
      feedback,
    });
  } catch (err) {
    console.error('Outcome recording failed:', err.message);
  }
}

// ============================================
// IPC HANDLERS (for Widget to use)
// ============================================

function registerIpcHandlers() {
  // Connect to hub
  ipcMain.handle('moltbook-connect', async () => {
    const store = getStore();
    const config = store.get('moltbookConfig');
    if (!config) return { success: false, error: 'No Moltbook configuration. Set hub URL in Settings.' };

    hubConfig = {
      hubUrl: config.hubUrl || 'http://localhost:3100',
      companyId: config.companyId || 'default',
      userId: config.userId || 'local-user',
      userEmail: config.userEmail || '',
    };

    const result = await connect();
    return { success: result };
  });

  // Disconnect
  ipcMain.handle('moltbook-disconnect', async () => {
    await disconnect();
    return { success: true };
  });

  // Get connection status
  ipcMain.handle('moltbook-status', async () => {
    return { connected: isConnected, hubUrl: hubConfig?.hubUrl || null };
  });

  // Search knowledge (for Ask AI)
  ipcMain.handle('moltbook-search-knowledge', async (event, keywords, actionType) => {
    try {
      const results = await searchKnowledge(keywords, actionType);
      return { success: true, results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get pending suggestions
  ipcMain.handle('moltbook-get-suggestions', async () => {
    if (!hubConfig || !isConnected) return { success: false, suggestions: [] };

    try {
      const data = await hubFetch('GET',
        `/api/suggestions/pending?userId=${hubConfig.userId}`
      );
      return { success: true, suggestions: data.suggestions || [] };
    } catch (err) {
      return { success: false, error: err.message, suggestions: [] };
    }
  });

  // Record suggestion outcome
  ipcMain.handle('moltbook-record-outcome', async (event, payload) => {
    try {
      await recordOutcome(
        payload.suggestionId,
        payload.action,
        payload.wasSuccessful,
        payload.editedText,
        payload.feedback
      );
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Share knowledge
  ipcMain.handle('moltbook-share-knowledge', async (event, knowledge) => {
    if (!hubConfig) return { success: false, error: 'Not connected' };

    try {
      await hubFetch('POST', '/api/knowledge/share', {
        ...knowledge,
        companyId: hubConfig.companyId,
        userId: hubConfig.userId,
      });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Who handles X?
  ipcMain.handle('moltbook-who-handles', async (event, actionType, keywords) => {
    if (!hubConfig) return { found: false };

    try {
      return await hubFetch('POST', '/api/routing/who-handles', {
        companyId: hubConfig.companyId,
        actionType,
        keywords,
      });
    } catch (err) {
      return { found: false, error: err.message };
    }
  });

  // Save Moltbook config
  ipcMain.handle('moltbook-save-config', async (event, config) => {
    const store = getStore();
    store.set('moltbookConfig', config);
    hubConfig = {
      hubUrl: config.hubUrl || 'http://localhost:3100',
      companyId: config.companyId || 'default',
      userId: config.userId || 'local-user',
      userEmail: config.userEmail || '',
    };
    return { success: true };
  });

  // Get Moltbook config
  ipcMain.handle('moltbook-get-config', async () => {
    const store = getStore();
    return store.get('moltbookConfig') || null;
  });
}

// ============================================
// MODULE INIT
// ============================================

module.exports = function initMoltbookBridge(deps) {
  getOverlayWindow = deps.getOverlayWindow;
  getStore = deps.getStore;

  registerIpcHandlers();

  return {
    connect,
    disconnect,
    uploadContext,
    searchKnowledge,
    recordOutcome,
    isConnected: () => isConnected,
  };
};
