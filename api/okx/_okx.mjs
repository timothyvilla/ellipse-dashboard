// api/okx/_okx.js
// ──────────────────────────────────────────────────────────────────
// Shared OKX v5 request signer + fetch helper for serverless routes.
//
// Credentials are read from environment variables ONLY — never sent to
// the browser. Configure these in Vercel → Project → Settings → Env Vars:
//   OKX_API_KEY
//   OKX_API_SECRET
//   OKX_API_PASSPHRASE
// Use a READ-ONLY API key (no trade / no withdraw permissions).
// ──────────────────────────────────────────────────────────────────
import crypto from 'crypto';

const OKX_BASE = 'https://www.okx.com';

/**
 * Build the signed headers for an OKX v5 private request.
 * Signature = Base64( HMAC-SHA256( timestamp + method + requestPath + body, secret ) )
 */
function sign(timestamp, method, requestPath, body, secret) {
  const prehash = timestamp + method.toUpperCase() + requestPath + (body || '');
  return crypto.createHmac('sha256', secret).update(prehash).digest('base64');
}

/**
 * Per-sub-account credentials.
 *
 * OKX will not serve a sub-account's fills or positions to a master key — those
 * endpoints have no `subAcct` parameter. To read them we must sign as the
 * sub-account itself, using a read-only key created inside that sub-account.
 *
 * Configure one JSON env var (single line, no trailing commas):
 *
 *   OKX_SUB_ACCOUNTS=[{"name":"trading01","key":"...","secret":"...","passphrase":"..."}]
 *
 * `name` must match the sub-account name OKX reports in /users/subaccount/list.
 * Accounts absent from this list still work for balances via the master key.
 */
function loadSubAccountCreds() {
  const raw = process.env.OKX_SUB_ACCOUNTS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const map = {};
    for (const entry of list) {
      if (entry?.name && entry.key && entry.secret && entry.passphrase) {
        map[entry.name] = { key: entry.key, secret: entry.secret, passphrase: entry.passphrase };
      }
    }
    return map;
  } catch {
    console.warn('OKX_SUB_ACCOUNTS is not valid JSON — ignoring it.');
    return {};
  }
}

/** Names of sub-accounts that have their own credentials configured. */
export function configuredSubAccounts() {
  return Object.keys(loadSubAccountCreds());
}

/**
 * Resolve credentials for an account.
 * @param {string} [account] sub-account name; omit/'main' for the master key.
 */
function resolveCreds(account) {
  if (account && account !== 'main') {
    const creds = loadSubAccountCreds()[account];
    if (!creds) return { error: 'no_subaccount_credentials', account };
    return creds;
  }
  return {
    key: process.env.OKX_API_KEY,
    secret: process.env.OKX_API_SECRET,
    passphrase: process.env.OKX_API_PASSPHRASE,
  };
}

/**
 * Perform a signed GET against an OKX v5 endpoint.
 * @param {string} requestPath e.g. "/api/v5/account/balance"
 * @param {string} [account]   sub-account name to sign as; defaults to the master key.
 * @returns {Promise<{status:number, body:object}>}
 */
export async function okxGet(requestPath, account) {
  const creds = resolveCreds(account);

  if (creds.error === 'no_subaccount_credentials') {
    return {
      status: 400,
      body: {
        error: 'no_subaccount_credentials',
        account: creds.account,
        msg: `No API key configured for sub-account "${creds.account}". Create a read-only key inside that sub-account on OKX and add it to OKX_SUB_ACCOUNTS.`,
      },
    };
  }

  const { key, secret, passphrase } = creds;
  if (!key || !secret || !passphrase) {
    return {
      status: 500,
      body: {
        error: 'missing_credentials',
        msg: 'OKX_API_KEY / OKX_API_SECRET / OKX_API_PASSPHRASE not configured on the server.',
      },
    };
  }

  const timestamp = new Date().toISOString();
  const signature = sign(timestamp, 'GET', requestPath, '', secret);

  const res = await fetch(OKX_BASE + requestPath, {
    method: 'GET',
    headers: {
      'OK-ACCESS-KEY': key,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
    },
  });

  let json;
  try {
    json = await res.json();
  } catch {
    json = { code: 'parse_error', msg: 'Non-JSON response from OKX' };
  }
  return { status: res.status, body: json };
}

/**
 * Standard JSON responder that also sets a short cache + no-store for safety.
 */
export function send(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}
