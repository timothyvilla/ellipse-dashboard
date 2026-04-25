// src/lib/security.js
// Add this file to: src/lib/security.js

// ── 1. SAFE IMAGE URL ALLOWLIST ───────────────────────────────────
const ALLOWED_IMAGE_HOSTS = new Set([
  's3.tradingview.com',
  'i.imgur.com',
  'prntscr.com',
  'prnt.sc',
  'i.ibb.co',
  'ibb.co',
]);

export const sanitizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const trimmed = url.trim();
    if (trimmed.length > 2048) return null;
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase();
    if (ALLOWED_IMAGE_HOSTS.has(hostname)) return parsed.href;
    for (const allowed of ALLOWED_IMAGE_HOSTS) {
      if (hostname === allowed || hostname.endsWith('.' + allowed)) {
        return parsed.href;
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const getTradingViewImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.length > 2048) return null;
  
  if (trimmed.includes('s3.tradingview.com')) {
    return sanitizeImageUrl(trimmed);
  }
  
  const match = trimmed.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
  if (match && /^[a-zA-Z0-9]+$/.test(match[1])) {
    const id = match[1];
    const resolved = `https://s3.tradingview.com/snapshots/${id.charAt(0).toLowerCase()}/${id}.png`;
    return sanitizeImageUrl(resolved);
  }
  return null;
};

// ── 2. INPUT VALIDATION ───────────────────────────────────────────
const SYMBOL_REGEX = /^[A-Z0-9.]{2,12}$/;
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const validateTrade = (trade) => {
  const errors = [];
  const symbol = (trade.symbol || '').trim().toUpperCase();
  if (!symbol || !SYMBOL_REGEX.test(symbol)) {
    errors.push('Symbol must be 2-12 uppercase letters/numbers.');
  }
  const entry = parseFloat(trade.entry);
  if (isNaN(entry) || entry <= 0 || entry > 1000000) {
    errors.push('Entry price must be positive and < 1,000,000.');
  }
  const exit = parseFloat(trade.exit);
  if (isNaN(exit) || exit <= 0 || exit > 1000000) {
    errors.push('Exit price must be positive and < 1,000,000.');
  }
  const lots = parseFloat(trade.lots);
  if (isNaN(lots) || lots <= 0) errors.push('Lot size must be positive.');
  if (lots > 1000) errors.push('Lot size cannot exceed 1,000.');
  if (!trade.date || !DATE_REGEX.test(trade.date)) {
    errors.push('Date must be in YYYY-MM-DD format.');
  }
  if (trade.time && !TIME_REGEX.test(trade.time)) {
    errors.push('Time must be in HH:MM format.');
  }
  if (!['Long', 'Short'].includes(trade.side)) {
    errors.push('Side must be "Long" or "Short".');
  }
  if (trade.notes && trade.notes.length > 5000) {
    errors.push('Notes too long (max 5,000 chars).');
  }
  return errors;
};

export const validateAccount = (account) => {
  const errors = [];
  const name = (account.name || '').trim();
  if (!name) errors.push('Account name is required.');
  if (name.length > 80) errors.push('Account name too long (max 80 chars).');
  if (/<[^>]*>/.test(name)) errors.push('Account name cannot contain HTML.');
  const balance = parseFloat(account.balance);
  if (isNaN(balance) || balance < 0) errors.push('Balance must be non-negative.');
  if (balance > 100_000_000) errors.push('Balance seems unrealistic.');
  return errors;
};

export const validateChallenge = (challenge) => {
  const errors = [];
  const name = (challenge.name || '').trim();
  if (!name) errors.push('Challenge name is required.');
  if (name.length > 100) errors.push('Challenge name too long.');
  const size = parseFloat(challenge.accountSize);
  if (isNaN(size) || size <= 0) errors.push('Account size must be positive.');
  if (size > 10_000_000) errors.push('Account size cannot exceed $10M.');
  if (!Array.isArray(challenge.phases) || challenge.phases.length === 0) {
    errors.push('At least one phase is required.');
  }
  return errors;
};

export const validateJournalEntry = (entry) => {
  const errors = [];
  const instrument = (entry.instrument || '').trim();
  if (!instrument) errors.push('Instrument is required.');
  if (instrument.length > 20) errors.push('Instrument name too long.');
  if (entry.idea && entry.idea.length > 5000) errors.push('Trade idea too long.');
  if (entry.notes && entry.notes.length > 5000) errors.push('Notes too long.');
  return errors;
};

// ── 3. HTML IMPORT SANITIZATION ───────────────────────────────────
const DANGEROUS_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta', 'base'];
const DANGEROUS_ATTRS = [
  'onabort', 'onblur', 'onchange', 'onclick', 'ondblclick', 'onerror', 'onfocus',
  'onkeydown', 'onkeypress', 'onkeyup', 'onload', 'onmousedown', 'onmousemove',
  'onmouseout', 'onmouseover', 'onmouseup', 'onreset', 'onresize', 'onscroll',
  'onselect', 'onsubmit', 'onunload', 'oncontextmenu', 'ondrag', 'ondrop',
  'oninput', 'oninvalid', 'onpaste', 'onsearch', 'ontouchstart', 'ontouchmove',
  'ontouchend', 'onwheel', 'onanimationstart', 'onanimationend'
];

export const sanitizeImportedHtml = (rawHtml) => {
  if (typeof rawHtml !== 'string') return '';
  if (rawHtml.length > 10 * 1024 * 1024) {
    throw new Error('HTML content too large (max 10MB)');
  }
  
  let clean = rawHtml;
  
  for (const tag of DANGEROUS_TAGS) {
    const regex = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi');
    clean = clean.replace(regex, '');
    const selfClosing = new RegExp(`<${tag}[^>]*\\/?>`, 'gi');
    clean = clean.replace(selfClosing, '');
  }
  
  for (const attr of DANGEROUS_ATTRS) {
    const regex1 = new RegExp(`\\s+${attr}\\s*=\\s*"[^"]*"`, 'gi');
    const regex2 = new RegExp(`\\s+${attr}\\s*=\\s*'[^']*'`, 'gi');
    const regex3 = new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>]*`, 'gi');
    clean = clean.replace(regex1, '').replace(regex2, '').replace(regex3, '');
  }
  
  clean = clean.replace(/(href|src|action)\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, '$1=""');
  clean = clean.replace(/(href|src)\s*=\s*["']?\s*data:[^"'\s>]*/gi, '$1=""');
  
  return clean;
};

// ── 4. CSV PROTOTYPE POLLUTION PROTECTION ─────────────────────────
const BLOCKED_KEYS = new Set([
  '__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__', 'hasOwnProperty', 'isPrototypeOf'
]);

export const safeCsvRow = (headers, values) => {
  const row = Object.create(null);
  headers.forEach((header, idx) => {
    const key = String(header).trim().toLowerCase();
    if (!key || BLOCKED_KEYS.has(key) || key.startsWith('__')) return;
    const value = values[idx] !== undefined ? String(values[idx]).trim() : '';
    row[key] = value.slice(0, 10000);
  });
  return row;
};

// ── 5. IMPORT SIZE LIMITS ─────────────────────────────────────────
export const IMPORT_LIMITS = {
  MAX_TRADES: 10_000,
  MAX_FILE_BYTES: 10 * 1024 * 1024,
  MAX_COLUMNS: 100,
};

export const checkFileSize = (file) => {
  if (!file) return 'No file provided.';
  if (file.size > IMPORT_LIMITS.MAX_FILE_BYTES) {
    return `File too large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Max 10 MB.`;
  }
  return null;
};

export const checkImportSize = (trades) => {
  if (!Array.isArray(trades)) return 'Invalid trades data.';
  if (trades.length > IMPORT_LIMITS.MAX_TRADES) {
    return `Import has ${trades.length.toLocaleString()} trades, max is ${IMPORT_LIMITS.MAX_TRADES.toLocaleString()}.`;
  }
  if (trades.length === 0) return 'No valid trades found.';
  return null;
};

// ── 6. EXCHANGE RATE VALIDATION ───────────────────────────────────
export const validateExchangeRates = (data) => {
  if (!data || data.result !== 'success') return false;
  if (typeof data.rates !== 'object' || data.rates === null) return false;
  const checks = [
    { ccy: 'EUR', min: 0.50, max: 1.50 },
    { ccy: 'GBP', min: 0.50, max: 1.50 },
    { ccy: 'JPY', min: 50, max: 300 },
  ];
  for (const { ccy, min, max } of checks) {
    const rate = data.rates[ccy];
    if (rate !== undefined && (typeof rate !== 'number' || rate < min || rate > max)) {
      return false;
    }
  }
  return true;
};

// ── 7. TEXT UTILITIES ─────────────────────────────────────────────
export const truncate = (str, maxLen = 500) => {
  if (typeof str !== 'string') return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
};

export const escapeHtml = (str) => {
  if (typeof str !== 'string') return '';
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return str.replace(/[&<>"']/g, char => entities[char]);
};

// ── 8. SECURE ID GENERATION ───────────────────────────────────────
export const generateSecureId = (prefix = '') => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID();
  }
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 16; i++) array[i] = Math.floor(Math.random() * 256);
  }
  return prefix + Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
};

// ── 9. RATE LIMITING ──────────────────────────────────────────────
export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }
  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(ts => now - ts < this.windowMs);
    return this.requests.length < this.maxRequests;
  }
  recordRequest() {
    this.requests.push(Date.now());
  }
}

// ── 10. SECURE LOCALSTORAGE ───────────────────────────────────────
export const secureLocalStorageSet = (key, value) => {
  try {
    const jsonString = JSON.stringify(value);
    localStorage.setItem(key, btoa(encodeURIComponent(jsonString)));
  } catch (err) {
    console.warn('Failed to save to localStorage');
  }
};

export const secureLocalStorageGet = (key, defaultValue = null) => {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    return JSON.parse(decodeURIComponent(atob(stored)));
  } catch {
    return defaultValue;
  }
};
