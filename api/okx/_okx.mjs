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
 * Perform a signed GET against an OKX v5 endpoint.
 * @param {string} requestPath e.g. "/api/v5/account/balance"
 * @returns {Promise<{status:number, body:object}>}
 */
export async function okxGet(requestPath) {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_API_SECRET;
  const passphrase = process.env.OKX_API_PASSPHRASE;

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
