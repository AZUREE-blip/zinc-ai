/**
 * Server-Side Privacy Filter for Moltbook Hub
 *
 * Final defense layer: redacts PII from data before it hits the database.
 * Even if a rogue client bypasses client-side filtering, this catches it.
 */

interface PiiPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

const PII_PATTERNS: PiiPattern[] = [
  {
    name: 'credit_card',
    regex: /\b(?:\d[ \-]*?){13,19}\b/g,
    replacement: '[REDACTED-CC]',
  },
  {
    name: 'ssn',
    regex: /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/g,
    replacement: '[REDACTED-SSN]',
  },
  {
    name: 'email_personal',
    regex: /\b[a-zA-Z0-9._%+\-]+@(?:gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|proton|ymail|live|msn|me)\.[a-z]{2,}\b/gi,
    replacement: '[REDACTED-EMAIL]',
  },
  {
    name: 'phone',
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[REDACTED-PHONE]',
  },
  {
    name: 'api_key_assignment',
    regex: /(?:api[_\-]?key|api[_\-]?secret|token|secret[_\-]?key|access[_\-]?token|auth[_\-]?token|bearer)\s*[:=]\s*\S{8,}/gi,
    replacement: '[REDACTED-KEY]',
  },
  {
    name: 'password_assignment',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*\S+/gi,
    replacement: '[REDACTED-PASSWORD]',
  },
  {
    name: 'aws_access_key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED-AWS]',
  },
  {
    name: 'jwt_token',
    regex: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g,
    replacement: '[REDACTED-JWT]',
  },
  {
    name: 'private_key',
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
    replacement: '[REDACTED-PRIVATE-KEY]',
  },
  {
    name: 'connection_string',
    regex: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s]+:[^\s]+@[^\s]+/gi,
    replacement: '[REDACTED-CONNECTION]',
  },
];

/**
 * Redact all PII from a text string.
 */
export function redactText(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let redacted = text;
  for (const pattern of PII_PATTERNS) {
    pattern.regex.lastIndex = 0;
    redacted = redacted.replace(pattern.regex, pattern.replacement);
  }
  return redacted;
}

/**
 * Redact PII from an array of strings.
 */
export function redactArray(items: string[]): string[] {
  if (!items || !Array.isArray(items)) return items;
  return items.map(item => redactText(item));
}
