# Ellipse Trading Journal - Security Assessment Report

**Date:** March 26, 2026  
**Assessor:** Security Review  
**Severity Levels:** Critical | High | Medium | Low | Info

---

## Executive Summary

This security assessment identified **15 vulnerabilities** across the Ellipse Trading Journal codebase:

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 5 |
| Low | 4 |

---

## Critical Vulnerabilities

### 1. CRIT-001: Exposed Supabase Credentials in Repository

**Location:** `.env` file committed to repository  
**Severity:** Critical  
**CVSS Score:** 9.8

**Issue:** The `.env` file containing Supabase URL and anonymous key is included in the document set, suggesting it may be committed to version control despite being in `.gitignore`.

```
VITE_SUPABASE_URL=https://ksbhbhjnrrkcnunehksx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_TuOzT-D-VDS5z5OlDnZIqw_MnFBrcpJ
```

**Impact:** 
- Unauthorized database access
- Data exfiltration
- Account takeover

**Recommendation:**
1. Immediately rotate the Supabase anonymous key
2. Never commit `.env` files to version control
3. Add `.env` to `.gitignore` (already present but verify enforcement)
4. Use environment variables in CI/CD pipelines
5. Consider implementing Row Level Security (RLS) in Supabase

---

### 2. CRIT-002: Missing Row Level Security (RLS) / Authentication

**Location:** `src/App.jsx` - All database operations  
**Severity:** Critical  
**CVSS Score:** 9.1

**Issue:** The application accesses Supabase without any user authentication. All data is globally accessible with the anonymous key.

```javascript
// No authentication check before database operations
const [tradesRes, accountsRes] = await Promise.all([
  supabase.from('trades').select('*').order('date', { ascending: false }),
  supabase.from('accounts').select('*').order('created_at', { ascending: true })
]);
```

**Impact:**
- Any user with the anonymous key can read/modify all data
- No data isolation between users
- Complete data breach possible

**Recommendation:**
1. Implement Supabase Auth for user authentication
2. Enable Row Level Security (RLS) on all tables
3. Create RLS policies that restrict data to authenticated users
4. Add authentication state management to the React app

---

## High Severity Vulnerabilities

### 3. HIGH-001: Insufficient HTML Sanitization (XSS Risk)

**Location:** `security.js` - `sanitizeImportedHtml()` function  
**Severity:** High  
**CVSS Score:** 7.5

**Issue:** The HTML sanitization uses regex patterns which can be bypassed:

```javascript
// Vulnerable patterns - can be bypassed with encoding tricks
clean = clean.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
clean = clean.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');
```

**Bypass Examples:**
- `<img src=x onerror&#x3D;"alert(1)">`
- `<svg onload=alert(1)>`
- `<body onpageshow="alert(1)">`
- Nested/malformed tags

**Recommendation:**
1. Use DOMPurify library for robust HTML sanitization
2. Implement Content Security Policy (CSP) headers
3. Parse HTML with a proper DOM parser and whitelist allowed tags/attributes

---

### 4. HIGH-002: Unsafe Image URL Validation

**Location:** `security.js` - `sanitizeImageUrl()` function  
**Severity:** High  
**CVSS Score:** 7.2

**Issue:** The image URL allowlist can be bypassed with subdomain attacks:

```javascript
const isAllowed = ALLOWED_IMAGE_HOSTS.some(
  (host) => parsed.hostname === host || parsed.hostname.endsWith('.' + host)
);
```

**Bypass Examples:**
- `evil-s3.tradingview.com` would match
- `s3.tradingview.com.evil.com` - if DNS is controlled
- Open redirects on allowed hosts

**Recommendation:**
1. Use strict hostname matching with explicit subdomain handling
2. Validate the full URL path structure
3. Consider proxying images through your own server
4. Implement Content-Security-Policy img-src directive

---

### 5. HIGH-003: Prototype Pollution in CSV Parser

**Location:** `security.js` - `safeCsvRow()` function  
**Severity:** High  
**CVSS Score:** 7.0

**Issue:** While `__proto__`, `constructor`, and `prototype` are blocked, other dangerous properties are not:

```javascript
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
```

**Missing Blocks:**
- `__defineGetter__`
- `__defineSetter__`
- `__lookupGetter__`
- `__lookupSetter__`

**Recommendation:**
1. Expand the blocked keys list
2. Use `Object.create(null)` for row objects (already done, but verify)
3. Validate that values are primitive types only

---

### 6. HIGH-004: Missing Input Validation on Client-Side

**Location:** `src/App.jsx` - Trade/Account forms  
**Severity:** High  
**CVSS Score:** 6.8

**Issue:** Client-side validation functions exist in `security.js` but are not consistently called before saving data:

```javascript
// validateTrade() exists but not called in handleSave()
const handleSave = () => {
  const rr = trade.stopLoss && trade.takeProfit && trade.entry ...
  onSave({ ...trade, ... }); // No validation!
};
```

**Recommendation:**
1. Call validation functions before all save operations
2. Display validation errors to users
3. Implement server-side validation as defense in depth

---

## Medium Severity Vulnerabilities

### 7. MED-001: localStorage Data Not Encrypted

**Location:** `src/App.jsx` - Challenge/Journal localStorage fallback  
**Severity:** Medium  
**CVSS Score:** 5.5

**Issue:** Sensitive trading data is stored in localStorage without encryption:

```javascript
localStorage.setItem('ellipse_challenges', JSON.stringify(challenges));
localStorage.setItem('ellipse_journal_entries', JSON.stringify(journalEntries));
```

**Recommendation:**
1. Encrypt data before storing in localStorage
2. Use sessionStorage for session-only data
3. Consider using IndexedDB with encryption for larger datasets

---

### 8. MED-002: Missing Rate Limiting on API Calls

**Location:** `src/App.jsx` - `fetchExchangeRates()` and external API calls  
**Severity:** Medium  
**CVSS Score:** 5.3

**Issue:** No rate limiting or caching strategy for external API calls:

```javascript
const fetchExchangeRates = async () => {
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  // No caching, no rate limiting
};
```

**Recommendation:**
1. Implement caching with expiration
2. Add exponential backoff for retries
3. Store rates in localStorage with TTL

---

### 9. MED-003: Insecure External Resource Loading

**Location:** `src/App.jsx` - Google Fonts import  
**Severity:** Medium  
**CVSS Score:** 5.0

**Issue:** External fonts loaded without Subresource Integrity (SRI):

```javascript
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700...')
```

**Recommendation:**
1. Self-host fonts
2. Add SRI hashes if using CDN
3. Implement CSP font-src directive

---

### 10. MED-004: Potential DoS via Large Import Files

**Location:** `security.js` - `IMPORT_LIMITS`  
**Severity:** Medium  
**CVSS Score:** 4.8

**Issue:** While limits exist, they're only checked after parsing:

```javascript
export const IMPORT_LIMITS = {
  MAX_TRADES: 10_000,
  MAX_FILE_BYTES: 10 * 1024 * 1024, // 10 MB
};
```

The file is fully parsed before checking limits, allowing DoS.

**Recommendation:**
1. Check file size BEFORE reading content
2. Use streaming parsers for large files
3. Add timeouts for parsing operations

---

### 11. MED-005: Missing HTTPS Enforcement

**Location:** `security.js` - `sanitizeImageUrl()`  
**Severity:** Medium  
**CVSS Score:** 4.5

**Issue:** HTTP URLs are allowed for images:

```javascript
if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
```

**Recommendation:**
1. Enforce HTTPS only for external resources
2. Implement HSTS headers on deployment

---

## Low Severity Vulnerabilities

### 12. LOW-001: Verbose Error Messages

**Location:** Various  
**Severity:** Low  
**CVSS Score:** 3.5

**Issue:** Console errors expose internal details:

```javascript
console.error('Error adding trade:', error);
```

**Recommendation:**
1. Use generic error messages for users
2. Log detailed errors server-side only

---

### 13. LOW-002: Missing Security Headers Configuration

**Location:** Missing `vite.config.js` security headers  
**Severity:** Low  
**CVSS Score:** 3.0

**Recommendation:** Add security headers in production:
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy

---

### 14. LOW-003: Weak Random ID Generation

**Location:** `src/App.jsx`  
**Severity:** Low  
**CVSS Score:** 2.5

**Issue:** Using Date.now() for ID generation:

```javascript
const id = 'je_' + Date.now();
const id = 'local_' + Date.now();
```

**Recommendation:**
1. Use crypto.randomUUID() for client-side IDs
2. Or use database-generated UUIDs

---

### 15. LOW-004: Missing Supabase Client Version Lock

**Location:** `package.json`  
**Severity:** Low  
**CVSS Score:** 2.0

**Issue:** Dependency version uses caret (^) allowing minor updates:

```json
"@supabase/supabase-js": "^2.39.0"
```

**Recommendation:**
1. Lock critical dependency versions
2. Use package-lock.json
3. Implement automated dependency scanning

---

## Additional Recommendations

### Security Best Practices

1. **Implement Content Security Policy (CSP)**
   ```html
   <meta http-equiv="Content-Security-Policy" 
         content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'">
   ```

2. **Add Supabase Row Level Security**
   ```sql
   ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "Users can only see their own trades" ON trades
     FOR ALL USING (auth.uid() = user_id);
   ```

3. **Implement Rate Limiting**
   - Add client-side rate limiting for API calls
   - Use Supabase's built-in rate limiting features

4. **Add Input Sanitization**
   - Install and use DOMPurify for HTML
   - Validate all numeric inputs server-side

5. **Security Monitoring**
   - Add error tracking (Sentry, etc.)
   - Monitor for suspicious database queries
   - Implement audit logging for sensitive operations

---

## Files Requiring Changes

| File | Changes Required |
|------|-----------------|
| `security.js` | Enhanced sanitization, expanded blocked keys |
| `src/App.jsx` | Add validation calls, secure ID generation |
| `supabaseClient.js` | Add connection retry logic |
| `.env` | ROTATE CREDENTIALS IMMEDIATELY |
| `vite.config.js` | Add security headers for production |
| `package.json` | Lock dependency versions |

---

## Conclusion

The Ellipse Trading Journal has significant security vulnerabilities that require immediate attention. The most critical issues are:

1. **Exposed credentials** - Rotate immediately
2. **No authentication** - Implement Supabase Auth + RLS
3. **Weak HTML sanitization** - Use DOMPurify

Addressing these vulnerabilities should be prioritized before any production deployment.
