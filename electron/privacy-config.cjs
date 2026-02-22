/**
 * Privacy Configuration for Zinc.ai
 *
 * Single source of truth for all privacy and data protection rules.
 * Controls what data gets captured, redacted, shared, and retained.
 */

const DEFAULT_PRIVACY_CONFIG = {
  // --- PII Detection & Redaction ---
  piiRedactionEnabled: true,

  // --- Work-Only Content Filter ---
  workOnlyFilterEnabled: true,

  // Apps that are NEVER monitored (personal use)
  blockedApps: [
    // Dating
    'tinder', 'bumble', 'hinge', 'grindr', 'match',
    // Social media
    'instagram', 'tiktok', 'snapchat', 'facebook', 'messenger',
    'twitter', 'x',
    // Entertainment
    'netflix', 'hulu', 'disney', 'spotify', 'apple music',
    'vlc', 'plex',
    // Gaming
    'steam', 'epic games', 'xbox', 'playstation', 'battle.net',
    'riot client', 'origin',
    // Personal banking / finance
    'chase', 'wells fargo', 'bank of america', 'citi',
    'venmo', 'cash app', 'zelle',
    'robinhood', 'coinbase', 'binance',
    // Personal messaging
    'whatsapp', 'telegram', 'signal', 'imessage',
  ],

  // URLs that are NEVER captured
  blockedUrls: [
    // Social media
    'facebook.com', 'instagram.com', 'tiktok.com',
    'twitter.com', 'x.com', 'reddit.com', 'snapchat.com',
    // Entertainment
    'netflix.com', 'hulu.com', 'disneyplus.com',
    'twitch.tv', 'crunchyroll.com',
    // Dating
    'tinder.com', 'bumble.com', 'hinge.co', 'match.com',
    // Personal banking
    'chase.com', 'bankofamerica.com', 'wellsfargo.com',
    'citi.com', 'capitalone.com',
    'venmo.com', 'cashapp.com',
    // Personal email
    'mail.google.com', 'outlook.live.com', 'mail.yahoo.com',
    'protonmail.com', 'proton.me/mail',
    // Crypto / investment
    'robinhood.com', 'coinbase.com', 'binance.com',
  ],

  // Apps allowed for work context capture
  allowedApps: [
    // Communication
    'slack', 'teams', 'microsoft teams', 'outlook', 'zoom',
    'google meet', 'webex', 'discord',
    // Browsers (URL filtering handles personal sites)
    'chrome', 'google chrome', 'edge', 'microsoft edge',
    'firefox', 'brave', 'arc', 'safari',
    // Dev tools
    'code', 'visual studio code', 'vscode',
    'visual studio', 'intellij', 'webstorm', 'pycharm',
    'rider', 'goland', 'android studio', 'xcode',
    'terminal', 'cmd', 'powershell', 'iterm', 'warp',
    'windowsterminal', 'git bash', 'hyper',
    'docker', 'postman', 'insomnia',
    // Productivity
    'winword', 'word', 'excel', 'powerpnt', 'powerpoint',
    'onenote', 'notepad', 'notepad++', 'sublime text',
    'google docs', 'google sheets',
    // Design & PM
    'figma', 'sketch', 'adobe', 'photoshop', 'illustrator',
    'notion', 'linear', 'jira', 'confluence', 'asana',
    'trello', 'monday', 'clickup',
    // File management
    'finder', 'explorer', 'file explorer',
    // Zinc.ai itself
    'zinc', 'electron',
  ],

  // --- Audience Controls ---
  maxSuggestionRecipients: 1,       // Suggestions go to exactly 1 person
  allowBroadcastContent: false,     // broadcastToAll limited to system messages only

  // --- Data Retention (days) ---
  contextRetentionDays: 7,
  suggestionRetentionDays: 30,
  outcomeRetentionDays: 90,
};

let _store = null;
const CONFIG_KEY = 'privacyConfig';

/**
 * Initialize the privacy config with an electron-store instance.
 */
function initPrivacyConfig(store) {
  _store = store;
  // Ensure defaults are set on first run
  if (!_store.get(CONFIG_KEY)) {
    _store.set(CONFIG_KEY, DEFAULT_PRIVACY_CONFIG);
  }
}

/**
 * Get the current privacy configuration (merged with defaults).
 */
function getPrivacyConfig() {
  if (!_store) return { ...DEFAULT_PRIVACY_CONFIG };
  const saved = _store.get(CONFIG_KEY) || {};
  return { ...DEFAULT_PRIVACY_CONFIG, ...saved };
}

/**
 * Update privacy configuration (partial updates allowed).
 */
function savePrivacyConfig(updates) {
  const current = getPrivacyConfig();
  const merged = { ...current, ...updates };
  if (_store) {
    _store.set(CONFIG_KEY, merged);
  }
  return merged;
}

/**
 * Get the default configuration (for reset).
 */
function getDefaultConfig() {
  return { ...DEFAULT_PRIVACY_CONFIG };
}

module.exports = {
  initPrivacyConfig,
  getPrivacyConfig,
  savePrivacyConfig,
  getDefaultConfig,
  DEFAULT_PRIVACY_CONFIG,
};
