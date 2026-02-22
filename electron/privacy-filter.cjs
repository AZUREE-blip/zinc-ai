/**
 * Privacy Filter for Zinc.ai
 *
 * Two responsibilities:
 * 1. PII Detection & Redaction — catches sensitive data before it leaves the machine
 * 2. Work-Only Content Filter — blocks non-work apps and URLs from being captured
 *
 * All functions are pure (no side effects, no state).
 */

// ============================================
// PII DETECTION & REDACTION
// ============================================

const PII_PATTERNS = [
  {
    name: 'credit_card',
    // 13-19 digit sequences with optional separators (Visa, MC, Amex, etc.)
    regex: /\b(?:\d[ \-]*?){13,19}\b/g,
    replacement: '[REDACTED-CC]',
  },
  {
    name: 'ssn',
    // US Social Security Numbers: XXX-XX-XXXX
    regex: /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/g,
    replacement: '[REDACTED-SSN]',
  },
  {
    name: 'email_personal',
    // Personal email providers only (work emails are allowed)
    regex: /\b[a-zA-Z0-9._%+\-]+@(?:gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|proton|ymail|live|msn|me)\.[a-z]{2,}\b/gi,
    replacement: '[REDACTED-EMAIL]',
  },
  {
    name: 'phone',
    // US/international phone numbers
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED-PHONE]',
  },
  {
    name: 'api_key_assignment',
    // API keys, tokens, secrets assigned with = or :
    regex: /(?:api[_\-]?key|api[_\-]?secret|token|secret[_\-]?key|access[_\-]?token|auth[_\-]?token|bearer)\s*[:=]\s*\S{8,}/gi,
    replacement: '[REDACTED-KEY]',
  },
  {
    name: 'password_assignment',
    // Password fields: password=xxx, passwd:xxx
    regex: /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi,
    replacement: '[REDACTED-PASSWORD]',
  },
  {
    name: 'aws_access_key',
    // AWS Access Key IDs: AKIA followed by 16 alphanumeric chars
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED-AWS]',
  },
  {
    name: 'jwt_token',
    // JWT tokens: eyJ... base64 segments
    regex: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
    replacement: '[REDACTED-JWT]',
  },
  {
    name: 'private_key',
    // PEM private key headers
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    replacement: '[REDACTED-PRIVATE-KEY]',
  },
  {
    name: 'connection_string',
    // Database connection strings with credentials
    regex: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s]+:[^\s]+@[^\s]+/gi,
    replacement: '[REDACTED-CONNECTION]',
  },
];

/**
 * Check if text contains any sensitive data.
 * @param {string} text
 * @returns {{ hasSensitive: boolean, types: string[] }}
 */
function containsSensitiveData(text) {
  if (!text || typeof text !== 'string') return { hasSensitive: false, types: [] };

  const types = [];
  for (const pattern of PII_PATTERNS) {
    // Reset regex state (global flag)
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      types.push(pattern.name);
    }
  }
  return { hasSensitive: types.length > 0, types };
}

/**
 * Redact all PII from a text string.
 * @param {string} text
 * @returns {string} Text with PII replaced by [REDACTED-*] tokens
 */
function redactSensitiveData(text) {
  if (!text || typeof text !== 'string') return text;

  let redacted = text;
  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0;
    redacted = redacted.replace(pattern.regex, pattern.replacement);
  }
  return redacted;
}

/**
 * Redact all PII from a context object (all string fields).
 * Returns a new object — does NOT mutate the original.
 * @param {Object} ctx
 * @returns {Object} Sanitized context object
 */
function redactContextObject(ctx) {
  if (!ctx) return ctx;

  return {
    ...ctx,
    windowTitle: redactSensitiveData(ctx.windowTitle),
    url: redactSensitiveData(ctx.url),
    observationText: redactSensitiveData(ctx.observationText),
    subject: redactSensitiveData(ctx.subject),
    person: redactSensitiveData(ctx.person),
    channel: ctx.channel, // Channel names are work context, keep as-is
  };
}


// ============================================
// WORK-ONLY CONTENT FILTER
// ============================================

/**
 * Check if an app is a work app (not personal).
 * Blocklist takes priority over allowlist.
 * @param {string} appName
 * @param {Object} config - Privacy config with blockedApps and allowedApps
 * @returns {boolean}
 */
function isWorkApp(appName, config) {
  if (!appName) return true; // Unknown app — don't block (could be work)
  const lower = appName.toLowerCase();

  // Blocklist check first — explicit deny wins
  if (config.blockedApps && config.blockedApps.some(blocked => lower.includes(blocked.toLowerCase()))) {
    return false;
  }

  // If allowlist exists and is non-empty, app must match
  if (config.allowedApps && config.allowedApps.length > 0) {
    return config.allowedApps.some(allowed => lower.includes(allowed.toLowerCase()));
  }

  return true; // No allowlist = allow all non-blocked
}

/**
 * Check if a URL is a work-related URL (not personal).
 * @param {string} url
 * @param {Object} config - Privacy config with blockedUrls
 * @returns {boolean}
 */
function isWorkUrl(url, config) {
  if (!url) return true; // No URL (desktop app) — already checked by isWorkApp
  const lower = url.toLowerCase();

  if (config.blockedUrls && config.blockedUrls.some(blocked => lower.includes(blocked.toLowerCase()))) {
    return false;
  }

  return true;
}

/**
 * Determine if context from this app/URL should be captured at all.
 * @param {Object} ctx - { appName, url, windowTitle }
 * @param {Object} config - Privacy config
 * @returns {{ allowed: boolean, reason: string }}
 */
function shouldCaptureContext(ctx, config) {
  if (!config.workOnlyFilterEnabled) {
    return { allowed: true, reason: 'Work-only filter disabled' };
  }

  if (!isWorkApp(ctx.appName, config)) {
    return { allowed: false, reason: `Blocked app: ${ctx.appName}` };
  }

  if (!isWorkUrl(ctx.url, config)) {
    return { allowed: false, reason: 'Blocked URL' };
  }

  return { allowed: true, reason: 'ok' };
}


module.exports = {
  // PII
  containsSensitiveData,
  redactSensitiveData,
  redactContextObject,
  PII_PATTERNS,

  // Work-only filter
  isWorkApp,
  isWorkUrl,
  shouldCaptureContext,
};
