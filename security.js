// src/lib/security.js
// ─────────────────────────────────────────────────────────────────
// Central security utilities for Ellipse Trading Journal
// ─────────────────────────────────────────────────────────────────

// ── 1. SAFE IMAGE URL ALLOWLIST ───────────────────────────────────
const ALLOWED_IMAGE_HOSTS = [
  's3.tradingview.com',
  'i.imgur.com',
  'prntscr.com',
  'prnt.sc',
  'i.ibb.co',
  'imagehost.cc',
];

/**
 * Returns the URL only if it matches an allowed image host, else null.
 */
export const sanitizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const isAllowed = ALLOWED_IMAGE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
    );
    return isAllowed ? parsed.href : null;
  } catch {
    return null;
  }
};

/**
 * Converts a TradingView share URL to its direct image URL,
 * then passes it through the allowlist check.
 */
export const getTradingViewImageUrl = (url) => {
  if (!url) return null;
  let resolved = url;

  // Already a direct S3 image
  if (url.includes('s3.tradingview.com')) {
    resolved = url;
  } else {
    const match = url.match(/tradingview\.com\/x\/([a-zA-Z0-9]+)/);
    if (match) {
      const id = match[1];
      resolved = `https://s3.tradingview.com/snapshots/${id.charAt(0).toLowerCase()}/${id}.png`;
    }
  }

  return sanitizeImageUrl(resolved);
};


// ── 2. INPUT VALIDATION ───────────────────────────────────────────
const SYMBOL_REGEX = /^[A-Z0-9.]{2,12}$/;

export const validateTrade = (trade) => {
  const errors = [];

  if (!trade.symbol || !SYMBOL_REGEX.test(trade.symbol.trim().toUpperCase())) {
    errors.push('Symbol must be 2–12 uppercase letters/numbers (e.g. EURUSD, XAUUSD).');
  }
  const entry = parseFloat(trade.entry);
  if (isNaN(entry) || entry <= 0) errors.push('Entry price must be a positive number.');

  const exit = parseFloat(trade.exit);
  if (isNaN(exit) || exit <= 0) errors.push('Exit price must be a positive number.');

  const lots = parseFloat(trade.lots);
  if (isNaN(lots) || lots <= 0) errors.push('Lot size must be positive.');
  if (lots > 1000) errors.push('Lot size cannot exceed 1,000.');

  const commission = parseFloat(trade.commission);
  if (!isNaN(commission) && Math.abs(commission) > 10000) {
    errors.push('Commission value seems unusually large (> $10,000).');
  }

  if (!trade.date || !/^\d{4}-\d{2}-\d{2}$/.test(trade.date)) {
    errors.push('Date must be in YYYY-MM-DD format.');
  }

  return errors; // empty array = valid
};

export const validateAccount = (account) => {
  const errors = [];
  if (!account.name || account.name.trim().length < 1) errors.push('Account name is required.');
  if (account.name && account.name.length > 80) errors.push('Account name is too long (max 80 chars).');
  const balance = parseFloat(account.balance);
  if (isNaN(balance) || balance < 0) errors.push('Balance must be a non-negative number.');
  if (balance > 100_000_000) errors.push('Balance seems unrealistically large.');
  return errors;
};

export const validateChallenge = (challenge) => {
  const errors = [];
  if (!challenge.name || challenge.name.trim().length < 1) errors.push('Challenge name is required.');
  const size = parseFloat(challenge.accountSize);
  if (isNaN(size) || size <= 0) errors.push('Account size must be positive.');
  if (size > 10_000_000) errors.push('Account size cannot exceed $10,000,000.');
  if (!Array.isArray(challenge.phases) || challenge.phases.length === 0) {
    errors.push('At least one phase is required.');
  }
  return errors;
};

export const validateJournalEntry = (entry) => {
  const errors = [];
  if (!entry.instrument || entry.instrument.trim().length < 1) errors.push('Instrument is required.');
  if (entry.instrument && entry.instrument.length > 20) errors.push('Instrument name too long.');
  if (entry.idea && entry.idea.length > 5000) errors.push('Trade idea text too long (max 5,000 chars).');
  if (entry.notes && entry.notes.length > 5000) errors.push('Notes too long (max 5,000 chars).');
  return errors;
};


// ── 3. HTML IMPORT SANITIZATION ───────────────────────────────────
/**
 * Strips all script tags, event handlers, and dangerous attributes
 * from raw HTML before passing it to DOMParser.
 * Works without an external library.
 */
export const sanitizeImportedHtml = (rawHtml) => {
  if (typeof rawHtml !== 'string') return '';

  // Remove <script> blocks entirely
  let clean = rawHtml.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove <style> blocks (not needed for parsing tables)
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove inline event handlers (onclick=, onerror=, onload=, etc.)
  clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: href/src attributes
  clean = clean.replace(/(href|src|action)\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, '');

  // Remove data: URIs in src/href (potential XSS vector)
  clean = clean.replace(/(href|src)\s*=\s*["']?\s*data:[^"'\s>]*/gi, '');

  return clean;
};


// ── 4. CSV PROTOTYPE POLLUTION PROTECTION ─────────────────────────
/**
 * Safely builds a row object from CSV headers + values
 * without risking prototype pollution.
 */
export const safeCsvRow = (headers, values) => {
  const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const row = Object.create(null);
  headers.forEach((header, idx) => {
    const key = String(header).trim().toLowerCase();
    if (key && !BLOCKED_KEYS.has(key)) {
      row[key] = (values[idx] ?? '').trim();
    }
  });
  return row;
};


// ── 5. IMPORT SIZE LIMITS ─────────────────────────────────────────
export const IMPORT_LIMITS = {
  MAX_TRADES:     10_000,
  MAX_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
};

export const checkImportSize = (trades) => {
  if (trades.length > IMPORT_LIMITS.MAX_TRADES) {
    return `Import contains ${trades.length.toLocaleString()} trades, which exceeds the limit of ${IMPORT_LIMITS.MAX_TRADES.toLocaleString()}.`;
  }
  return null;
};


// ── 6. EXCHANGE RATE RESPONSE VALIDATION ──────────────────────────
/**
 * Validates the shape and sanity of an exchange rate API response
 * before trusting it for P&L calculations.
 */
export const validateExchangeRates = (data) => {
  if (!data || data.result !== 'success') return false;
  if (typeof data.rates !== 'object' || data.rates === null) return false;

  // Sanity-check known currencies are in expected ranges
  const checks = [
    { ccy: 'EUR', min: 0.70, max: 1.30 },
    { ccy: 'GBP', min: 0.60, max: 1.20 },
    { ccy: 'JPY', min: 80,   max: 200  },
  ];
  for (const { ccy, min, max } of checks) {
    const rate = data.rates[ccy];
    if (rate !== undefined && (rate < min || rate > max)) {
      console.warn(`Exchange rate sanity check failed: ${ccy} = ${rate} (expected ${min}–${max})`);
      return false;
    }
  }
  return true;
};


// ── 7. SAFE TEXT TRUNCATION (prevent DOM flooding) ────────────────
export const truncate = (str, maxLen = 500) => {
  if (typeof str !== 'string') return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
};
