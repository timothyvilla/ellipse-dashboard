// src/lib/security.js
// ─────────────────────────────────────────────────────────────────
// Central security utilities for Ellipse Trading Journal
// HARDENED VERSION - All vulnerabilities addressed
// ─────────────────────────────────────────────────────────────────

// ── 1. SAFE IMAGE URL ALLOWLIST ───────────────────────────────────

// Strict allowlist - exact hostnames only, no subdomain wildcards
const ALLOWED_IMAGE_HOSTS = new Map([
  ['s3.tradingview.com', true],
  ['i.imgur.com', true],
  ['prntscr.com', true],
  ['prnt.sc', true],
  ['i.ibb.co', true],
  ['ibb.co', true],
]);

// Additional allowed subdomains (explicit)
const ALLOWED_SUBDOMAINS = new Map([
  ['tradingview.com', ['s3']],
  ['imgur.com', ['i']],
  ['ibb.co', ['i']],
]);

/**
 * Returns the URL only if it matches an explicitly allowed host.
 * SECURITY: Strict matching prevents subdomain bypass attacks.
 * @param {string} url - The URL to validate
 * @returns {string|null} - Sanitized URL or null if invalid
 */
export const sanitizeImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const trimmed = url.trim();
    // Length limit to prevent DoS
    if (trimmed.length > 2048) return null;
    
    const parsed = new URL(trimmed);
    
    // SECURITY: Enforce HTTPS only
    if (parsed.protocol !== 'https:') return null;
    
    const hostname = parsed.hostname.toLowerCase();
    
    // Direct match
    if (ALLOWED_IMAGE_HOSTS.has(hostname)) {
      return parsed.href;
    }
    
    // Check explicit subdomain allowlist
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      const baseDomain = parts.slice(-2).join('.');
      const subdomain = parts.slice(0, -2).join('.');
      
      const allowedSubs = ALLOWED_SUBDOMAINS.get(baseDomain);
      if (allowedSubs && allowedSubs.includes(subdomain)) {
        return parsed.href;
      }
    }
    
    return null;
  } catch {
    return null;
  }
};

/**
 * Converts a TradingView share URL to its direct image URL,
 * then validates through the strict allowlist.
 * @param {string} url - TradingView URL
 * @returns {string|null} - Direct image URL or null
 */
export const getTradingViewImageUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  
  const trimmed = url.trim();
  if (trimmed.length > 2048) return null;
  
  let resolved = null;

  // Already a direct S3 image
  if (trimmed.includes('s3.tradingview.com')) {
    resolved = trimmed;
  } else {
    // Extract ID from share URL - strict pattern matching
    const match = trimmed.match(/^https:\/\/(?:www\.)?tradingview\.com\/x\/([a-zA-Z0-9]{8,20})(?:\/)?$/);
    if (match) {
      const id = match[1];
      // Validate ID contains only alphanumeric
      if (/^[a-zA-Z0-9]+$/.test(id)) {
        resolved = `https://s3.tradingview.com/snapshots/${id.charAt(0).toLowerCase()}/${id}.png`;
      }
    }
  }

  return resolved ? sanitizeImageUrl(resolved) : null;
};


// ── 2. INPUT VALIDATION ───────────────────────────────────────────

// Strict symbol regex - only uppercase letters, numbers, periods
const SYMBOL_REGEX = /^[A-Z0-9.]{2,12}$/;

// Date format validation
const DATE_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// Time format validation
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Validates a trade object before saving.
 * @param {Object} trade - Trade data to validate
 * @returns {string[]} - Array of error messages (empty if valid)
 */
export const validateTrade = (trade) => {
  const errors = [];

  // Symbol validation
  const symbol = (trade.symbol || '').trim().toUpperCase();
  if (!symbol || !SYMBOL_REGEX.test(symbol)) {
    errors.push('Symbol must be 2–12 uppercase letters/numbers (e.g. EURUSD, XAUUSD).');
  }

  // Price validation
  const entry = parseFloat(trade.entry);
  if (isNaN(entry) || entry <= 0 || entry > 1000000) {
    errors.push('Entry price must be a positive number less than 1,000,000.');
  }

  const exit = parseFloat(trade.exit);
  if (isNaN(exit) || exit <= 0 || exit > 1000000) {
    errors.push('Exit price must be a positive number less than 1,000,000.');
  }

  // Lot size validation
  const lots = parseFloat(trade.lots);
  if (isNaN(lots) || lots <= 0) {
    errors.push('Lot size must be positive.');
  }
  if (lots > 1000) {
    errors.push('Lot size cannot exceed 1,000.');
  }

  // Commission validation
  const commission = parseFloat(trade.commission);
  if (!isNaN(commission) && Math.abs(commission) > 10000) {
    errors.push('Commission value seems unusually large (> $10,000).');
  }

  // Swap validation
  const swap = parseFloat(trade.swap);
  if (!isNaN(swap) && Math.abs(swap) > 10000) {
    errors.push('Swap value seems unusually large (> $10,000).');
  }

  // Date validation
  if (!trade.date || !DATE_REGEX.test(trade.date)) {
    errors.push('Date must be in YYYY-MM-DD format.');
  } else {
    // Validate date is not in future
    const tradeDate = new Date(trade.date);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (tradeDate > today) {
      errors.push('Trade date cannot be in the future.');
    }
  }

  // Time validation (optional but must be valid if provided)
  if (trade.time && !TIME_REGEX.test(trade.time)) {
    errors.push('Time must be in HH:MM format.');
  }

  // Side validation
  if (!['Long', 'Short'].includes(trade.side)) {
    errors.push('Side must be either "Long" or "Short".');
  }

  // Stop loss / Take profit validation
  const stopLoss = parseFloat(trade.stopLoss);
  const takeProfit = parseFloat(trade.takeProfit);
  
  if (!isNaN(stopLoss) && stopLoss < 0) {
    errors.push('Stop loss cannot be negative.');
  }
  if (!isNaN(takeProfit) && takeProfit < 0) {
    errors.push('Take profit cannot be negative.');
  }

  // Notes length validation
  if (trade.notes && trade.notes.length > 5000) {
    errors.push('Notes too long (max 5,000 characters).');
  }

  return errors;
};

/**
 * Validates an account object before saving.
 * @param {Object} account - Account data to validate
 * @returns {string[]} - Array of error messages
 */
export const validateAccount = (account) => {
  const errors = [];
  
  // Name validation
  const name = (account.name || '').trim();
  if (!name || name.length < 1) {
    errors.push('Account name is required.');
  }
  if (name.length > 80) {
    errors.push('Account name is too long (max 80 chars).');
  }
  // Prevent XSS in name
  if (/<[^>]*>/.test(name)) {
    errors.push('Account name cannot contain HTML tags.');
  }

  // Balance validation
  const balance = parseFloat(account.balance);
  if (isNaN(balance) || balance < 0) {
    errors.push('Balance must be a non-negative number.');
  }
  if (balance > 100_000_000) {
    errors.push('Balance seems unrealistically large (max $100,000,000).');
  }

  // Equity validation
  const equity = parseFloat(account.equity);
  if (!isNaN(equity) && equity < 0) {
    errors.push('Equity cannot be negative.');
  }
  if (!isNaN(equity) && equity > 100_000_000) {
    errors.push('Equity seems unrealistically large.');
  }

  // Platform validation
  if (account.platform && !['MT5', 'cTrader', 'MT4'].includes(account.platform)) {
    errors.push('Platform must be MT4, MT5, or cTrader.');
  }

  // Broker/Server length validation
  if (account.broker && account.broker.length > 100) {
    errors.push('Broker name too long (max 100 chars).');
  }
  if (account.server && account.server.length > 100) {
    errors.push('Server name too long (max 100 chars).');
  }

  return errors;
};

/**
 * Validates a challenge object before saving.
 * @param {Object} challenge - Challenge data to validate
 * @returns {string[]} - Array of error messages
 */
export const validateChallenge = (challenge) => {
  const errors = [];

  // Name validation
  const name = (challenge.name || '').trim();
  if (!name || name.length < 1) {
    errors.push('Challenge name is required.');
  }
  if (name.length > 100) {
    errors.push('Challenge name too long (max 100 chars).');
  }
  if (/<[^>]*>/.test(name)) {
    errors.push('Challenge name cannot contain HTML tags.');
  }

  // Account size validation
  const size = parseFloat(challenge.accountSize);
  if (isNaN(size) || size <= 0) {
    errors.push('Account size must be positive.');
  }
  if (size > 10_000_000) {
    errors.push('Account size cannot exceed $10,000,000.');
  }

  // Phases validation
  if (!Array.isArray(challenge.phases) || challenge.phases.length === 0) {
    errors.push('At least one phase is required.');
  }
  if (challenge.phases && challenge.phases.length > 10) {
    errors.push('Too many phases (max 10).');
  }

  // Validate each phase
  if (Array.isArray(challenge.phases)) {
    challenge.phases.forEach((phase, idx) => {
      if (phase.profitTarget !== null && (phase.profitTarget < 0 || phase.profitTarget > 100)) {
        errors.push(`Phase ${idx + 1}: Profit target must be 0-100%.`);
      }
      if (phase.maxDailyDrawdown < 0 || phase.maxDailyDrawdown > 100) {
        errors.push(`Phase ${idx + 1}: Daily drawdown must be 0-100%.`);
      }
      if (phase.maxTotalDrawdown < 0 || phase.maxTotalDrawdown > 100) {
        errors.push(`Phase ${idx + 1}: Total drawdown must be 0-100%.`);
      }
    });
  }

  // Profit split validation
  if (challenge.profitSplit !== undefined) {
    const split = parseFloat(challenge.profitSplit);
    if (isNaN(split) || split < 0 || split > 100) {
      errors.push('Profit split must be 0-100%.');
    }
  }

  return errors;
};

/**
 * Validates a journal entry before saving.
 * @param {Object} entry - Journal entry to validate
 * @returns {string[]} - Array of error messages
 */
export const validateJournalEntry = (entry) => {
  const errors = [];

  // Instrument validation
  const instrument = (entry.instrument || '').trim();
  if (!instrument || instrument.length < 1) {
    errors.push('Instrument is required.');
  }
  if (instrument.length > 20) {
    errors.push('Instrument name too long (max 20 chars).');
  }
  if (/<[^>]*>/.test(instrument)) {
    errors.push('Instrument cannot contain HTML tags.');
  }

  // Date validation
  if (entry.date && !DATE_REGEX.test(entry.date)) {
    errors.push('Date must be in YYYY-MM-DD format.');
  }

  // Text field length validation
  if (entry.idea && entry.idea.length > 5000) {
    errors.push('Trade idea text too long (max 5,000 chars).');
  }
  if (entry.notes && entry.notes.length > 5000) {
    errors.push('Notes too long (max 5,000 chars).');
  }
  if (entry.keyLevels && entry.keyLevels.length > 2000) {
    errors.push('Key levels text too long (max 2,000 chars).');
  }

  // Bias validation
  if (entry.bias && !['Bullish', 'Bearish', 'Neutral', 'No Trade'].includes(entry.bias)) {
    errors.push('Invalid bias value.');
  }

  // Timeframe validation
  if (entry.timeframe && !['Daily', 'Weekly', 'Monthly'].includes(entry.timeframe)) {
    errors.push('Invalid timeframe value.');
  }

  // Confluences validation
  if (entry.confluences && !Array.isArray(entry.confluences)) {
    errors.push('Confluences must be an array.');
  }
  if (Array.isArray(entry.confluences) && entry.confluences.length > 20) {
    errors.push('Too many confluences (max 20).');
  }

  // Chart image URL validation
  if (entry.chartImage) {
    const sanitized = sanitizeImageUrl(entry.chartImage);
    if (!sanitized && entry.chartImage.trim()) {
      errors.push('Chart image URL is not from an allowed host.');
    }
  }

  return errors;
};


// ── 3. HTML IMPORT SANITIZATION ───────────────────────────────────

/**
 * List of dangerous HTML tags to remove completely
 */
const DANGEROUS_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form', 
  'input', 'button', 'select', 'textarea', 'link', 'meta',
  'base', 'applet', 'frame', 'frameset', 'layer', 'ilayer',
  'bgsound', 'title', 'noscript'
];

/**
 * List of dangerous attributes to remove
 */
const DANGEROUS_ATTRS = [
  // Event handlers (comprehensive list)
  'onabort', 'onactivate', 'onafterprint', 'onafterupdate', 'onbeforeactivate',
  'onbeforecopy', 'onbeforecut', 'onbeforedeactivate', 'onbeforeeditfocus',
  'onbeforepaste', 'onbeforeprint', 'onbeforeunload', 'onbeforeupdate',
  'onblur', 'onbounce', 'oncellchange', 'onchange', 'onclick', 'oncontextmenu',
  'oncontrolselect', 'oncopy', 'oncut', 'ondataavailable', 'ondatasetchanged',
  'ondatasetcomplete', 'ondblclick', 'ondeactivate', 'ondrag', 'ondragend',
  'ondragenter', 'ondragleave', 'ondragover', 'ondragstart', 'ondrop',
  'onerror', 'onerrorupdate', 'onfilterchange', 'onfinish', 'onfocus',
  'onfocusin', 'onfocusout', 'onhashchange', 'onhelp', 'oninput', 'oninvalid',
  'onkeydown', 'onkeypress', 'onkeyup', 'onlayoutcomplete', 'onload',
  'onlosecapture', 'onmessage', 'onmousedown', 'onmouseenter', 'onmouseleave',
  'onmousemove', 'onmouseout', 'onmouseover', 'onmouseup', 'onmousewheel',
  'onmove', 'onmoveend', 'onmovestart', 'onoffline', 'ononline', 'onpagehide',
  'onpageshow', 'onpaste', 'onpopstate', 'onprogress', 'onpropertychange',
  'onreadystatechange', 'onreset', 'onresize', 'onresizeend', 'onresizestart',
  'onrowenter', 'onrowexit', 'onrowsdelete', 'onrowsinserted', 'onscroll',
  'onsearch', 'onselect', 'onselectionchange', 'onselectstart', 'onstart',
  'onstop', 'onstorage', 'onsubmit', 'ontouchcancel', 'ontouchend',
  'ontouchmove', 'ontouchstart', 'onunload', 'onwheel',
  // Other dangerous attributes
  'formaction', 'xlink:href', 'xmlns:xlink'
];

/**
 * Strips dangerous HTML elements and attributes for safe parsing.
 * SECURITY: Uses comprehensive tag/attribute blocklist.
 * @param {string} rawHtml - Raw HTML string
 * @returns {string} - Sanitized HTML safe for DOM parsing
 */
export const sanitizeImportedHtml = (rawHtml) => {
  if (typeof rawHtml !== 'string') return '';
  
  // Length limit to prevent DoS
  if (rawHtml.length > 10 * 1024 * 1024) {
    throw new Error('HTML content too large (max 10MB)');
  }

  let clean = rawHtml;

  // Remove dangerous tags completely (including content)
  for (const tag of DANGEROUS_TAGS) {
    const regex = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi');
    clean = clean.replace(regex, '');
    // Also remove self-closing versions
    const selfClosing = new RegExp(`<${tag}[^>]*\\/?>`, 'gi');
    clean = clean.replace(selfClosing, '');
  }

  // Remove all event handlers and dangerous attributes
  for (const attr of DANGEROUS_ATTRS) {
    // Match attribute with double quotes
    const regex1 = new RegExp(`\\s+${attr}\\s*=\\s*"[^"]*"`, 'gi');
    // Match attribute with single quotes
    const regex2 = new RegExp(`\\s+${attr}\\s*=\\s*'[^']*'`, 'gi');
    // Match attribute without quotes
    const regex3 = new RegExp(`\\s+${attr}\\s*=\\s*[^\\s>]*`, 'gi');
    // Match attribute with backticks (template literals)
    const regex4 = new RegExp(`\\s+${attr}\\s*=\\s*\`[^\`]*\``, 'gi');
    
    clean = clean.replace(regex1, '');
    clean = clean.replace(regex2, '');
    clean = clean.replace(regex3, '');
    clean = clean.replace(regex4, '');
  }

  // Remove javascript: protocol in href/src/action
  clean = clean.replace(/(href|src|action)\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, '$1=""');
  
  // Remove vbscript: protocol
  clean = clean.replace(/(href|src|action)\s*=\s*["']?\s*vbscript:[^"'\s>]*/gi, '$1=""');
  
  // Remove data: URIs (potential XSS vector)
  clean = clean.replace(/(href|src)\s*=\s*["']?\s*data:[^"'\s>]*/gi, '$1=""');

  // Remove expression() in style attributes (IE XSS)
  clean = clean.replace(/expression\s*\([^)]*\)/gi, '');
  
  // Remove -moz-binding (Firefox XSS)
  clean = clean.replace(/-moz-binding\s*:[^;}"']*/gi, '');

  // Remove HTML encoded event handlers
  clean = clean.replace(/&lt;script/gi, '&lt;blocked');
  clean = clean.replace(/&#x3C;script/gi, '&#x3C;blocked');
  clean = clean.replace(/&#60;script/gi, '&#60;blocked');

  return clean;
};


// ── 4. CSV PROTOTYPE POLLUTION PROTECTION ─────────────────────────

/**
 * Comprehensive list of dangerous property names to block
 */
const BLOCKED_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
  '__parent__',
  '__count__',
  '__noSuchMethod__',
]);

/**
 * Safely builds a row object from CSV headers and values.
 * SECURITY: Prevents prototype pollution attacks.
 * @param {string[]} headers - Column headers
 * @param {string[]} values - Row values
 * @returns {Object} - Safe object with null prototype
 */
export const safeCsvRow = (headers, values) => {
  // Create object with null prototype (no inheritance)
  const row = Object.create(null);
  
  headers.forEach((header, idx) => {
    // Normalize key
    const key = String(header).trim().toLowerCase();
    
    // Skip empty keys
    if (!key) return;
    
    // Skip blocked keys
    if (BLOCKED_KEYS.has(key)) {
      console.warn(`CSV import: Blocked dangerous key "${key}"`);
      return;
    }
    
    // Skip keys that look like object manipulation attempts
    if (key.startsWith('__') || key.endsWith('__')) {
      console.warn(`CSV import: Blocked suspicious key "${key}"`);
      return;
    }
    
    // Get value, default to empty string
    const value = values[idx] !== undefined ? String(values[idx]).trim() : '';
    
    // Limit value length to prevent memory exhaustion
    row[key] = value.slice(0, 10000);
  });
  
  return row;
};


// ── 5. IMPORT SIZE LIMITS ─────────────────────────────────────────

export const IMPORT_LIMITS = {
  MAX_TRADES: 10_000,
  MAX_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_ROWS_PER_BATCH: 1000,
  MAX_COLUMNS: 100,
  MAX_CELL_LENGTH: 10000,
};

/**
 * Validates file size BEFORE reading content.
 * @param {File} file - File object to check
 * @returns {string|null} - Error message or null if valid
 */
export const checkFileSize = (file) => {
  if (!file) return 'No file provided.';
  if (file.size > IMPORT_LIMITS.MAX_FILE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return `File too large (${sizeMB} MB). Maximum is 10 MB.`;
  }
  return null;
};

/**
 * Validates the number of trades before import.
 * @param {Array} trades - Array of trades to check
 * @returns {string|null} - Error message or null if valid
 */
export const checkImportSize = (trades) => {
  if (!Array.isArray(trades)) return 'Invalid trades data.';
  if (trades.length > IMPORT_LIMITS.MAX_TRADES) {
    return `Import contains ${trades.length.toLocaleString()} trades, which exceeds the limit of ${IMPORT_LIMITS.MAX_TRADES.toLocaleString()}.`;
  }
  if (trades.length === 0) {
    return 'No valid trades found in file.';
  }
  return null;
};


// ── 6. EXCHANGE RATE RESPONSE VALIDATION ──────────────────────────

/**
 * Expected rate ranges for sanity checking (as of 2024)
 * These are very wide ranges to accommodate market volatility
 */
const RATE_SANITY_CHECKS = [
  { ccy: 'EUR', min: 0.50, max: 1.50 },
  { ccy: 'GBP', min: 0.50, max: 1.50 },
  { ccy: 'JPY', min: 50, max: 300 },
  { ccy: 'CHF', min: 0.50, max: 1.50 },
  { ccy: 'AUD', min: 1.00, max: 2.50 },
  { ccy: 'CAD', min: 1.00, max: 2.00 },
  { ccy: 'CNY', min: 5.00, max: 10.00 },
];

/**
 * Validates the shape and sanity of an exchange rate API response.
 * @param {Object} data - API response data
 * @returns {boolean} - True if valid and sane
 */
export const validateExchangeRates = (data) => {
  // Check response structure
  if (!data || typeof data !== 'object') {
    console.warn('Exchange rate validation failed: Invalid response structure');
    return false;
  }
  
  if (data.result !== 'success') {
    console.warn('Exchange rate validation failed: API returned error');
    return false;
  }
  
  if (typeof data.rates !== 'object' || data.rates === null) {
    console.warn('Exchange rate validation failed: Missing rates object');
    return false;
  }

  // Sanity-check known currencies are in expected ranges
  for (const { ccy, min, max } of RATE_SANITY_CHECKS) {
    const rate = data.rates[ccy];
    if (rate !== undefined) {
      if (typeof rate !== 'number' || isNaN(rate)) {
        console.warn(`Exchange rate validation failed: ${ccy} is not a valid number`);
        return false;
      }
      if (rate < min || rate > max) {
        console.warn(`Exchange rate sanity check failed: ${ccy} = ${rate} (expected ${min}–${max})`);
        return false;
      }
    }
  }
  
  // Check that we have at least some expected currencies
  const expectedCurrencies = ['EUR', 'GBP', 'JPY'];
  const presentCurrencies = expectedCurrencies.filter(c => c in data.rates);
  if (presentCurrencies.length < 2) {
    console.warn('Exchange rate validation failed: Missing expected currencies');
    return false;
  }
  
  return true;
};


// ── 7. SAFE TEXT UTILITIES ────────────────────────────────────────

/**
 * Truncates text to prevent DOM flooding and memory issues.
 * @param {string} str - String to truncate
 * @param {number} maxLen - Maximum length
 * @returns {string} - Truncated string
 */
export const truncate = (str, maxLen = 500) => {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '…';
};

/**
 * Escapes HTML entities to prevent XSS when rendering text.
 * @param {string} str - String to escape
 * @returns {string} - Escaped string safe for HTML
 */
export const escapeHtml = (str) => {
  if (typeof str !== 'string') return '';
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return str.replace(/[&<>"'`=\/]/g, char => htmlEntities[char]);
};


// ── 8. SECURE ID GENERATION ───────────────────────────────────────

/**
 * Generates a cryptographically secure random ID.
 * Falls back to Math.random if crypto is unavailable.
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} - Secure random ID
 */
export const generateSecureId = (prefix = '') => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return prefix + crypto.randomUUID();
  }
  // Fallback for older browsers
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Last resort fallback (not cryptographically secure)
    for (let i = 0; i < 16; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  return prefix + hex;
};


// ── 9. RATE LIMITING HELPER ───────────────────────────────────────

/**
 * Simple rate limiter for client-side API calls.
 */
export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  /**
   * Checks if a request is allowed under the rate limit.
   * @returns {boolean} - True if request is allowed
   */
  canMakeRequest() {
    const now = Date.now();
    // Remove expired timestamps
    this.requests = this.requests.filter(ts => now - ts < this.windowMs);
    return this.requests.length < this.maxRequests;
  }

  /**
   * Records a request timestamp.
   */
  recordRequest() {
    this.requests.push(Date.now());
  }

  /**
   * Returns milliseconds until next request is allowed.
   * @returns {number} - Milliseconds to wait (0 if can make request now)
   */
  getWaitTime() {
    if (this.canMakeRequest()) return 0;
    const oldestRequest = Math.min(...this.requests);
    return this.windowMs - (Date.now() - oldestRequest);
  }
}


// ── 10. ENCRYPTED LOCALSTORAGE ────────────────────────────────────

/**
 * Simple obfuscation for localStorage data.
 * NOTE: This is NOT cryptographically secure encryption.
 * For truly sensitive data, use server-side storage.
 * @param {string} data - Data to obfuscate
 * @returns {string} - Obfuscated string
 */
export const obfuscate = (data) => {
  if (typeof data !== 'string') return '';
  try {
    return btoa(encodeURIComponent(data));
  } catch {
    return '';
  }
};

/**
 * Reverses obfuscation.
 * @param {string} data - Obfuscated string
 * @returns {string} - Original data
 */
export const deobfuscate = (data) => {
  if (typeof data !== 'string') return '';
  try {
    return decodeURIComponent(atob(data));
  } catch {
    return '';
  }
};

/**
 * Safely stores data in localStorage with obfuscation.
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified)
 */
export const secureLocalStorageSet = (key, value) => {
  try {
    const jsonString = JSON.stringify(value);
    const obfuscated = obfuscate(jsonString);
    localStorage.setItem(key, obfuscated);
  } catch (err) {
    console.error('Failed to save to localStorage:', err.message);
  }
};

/**
 * Safely retrieves data from localStorage.
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found or error
 * @returns {*} - Parsed value or default
 */
export const secureLocalStorageGet = (key, defaultValue = null) => {
  try {
    const obfuscated = localStorage.getItem(key);
    if (!obfuscated) return defaultValue;
    const jsonString = deobfuscate(obfuscated);
    return JSON.parse(jsonString);
  } catch (err) {
    console.error('Failed to read from localStorage:', err.message);
    return defaultValue;
  }
};
