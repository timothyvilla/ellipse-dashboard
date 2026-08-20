// OKX V5 signed REST client.
// Mirrors the server-side secret handling in api/_auth.mjs — creds come from
// env only, never the React bundle.
//
// Signature (per OKX docs):
//   OK-ACCESS-SIGN = base64( HMAC_SHA256( secretKey, timestamp + method + requestPath + body ) )
//   timestamp is ISO-8601 with millis, e.g. 2020-12-08T09:08:57.715Z
//   requestPath INCLUDES the query string; body is '' for GET.

import crypto from 'node:crypto';

const BASE = process.env.OKX_API_BASE || 'https://www.okx.com';

function creds() {
  const {
    OKX_API_KEY: apiKey,
    OKX_API_SECRET: secret,
    OKX_API_PASSPHRASE: passphrase,
    OKX_SIMULATED, // '1' for demo/paper trading accounts
  } = process.env;
  if (!apiKey || !secret || !passphrase) {
    throw new Error(
      'Missing OKX creds: set OKX_API_KEY, OKX_API_SECRET, OKX_API_PASSPHRASE (read-only key recommended).'
    );
  }
  return { apiKey, secret, passphrase, simulated: OKX_SIMULATED === '1' };
}

export function sign({ secret, timestamp, method, requestPath, body = '' }) {
  return crypto
    .createHmac('sha256', secret)
    .update(timestamp + method.toUpperCase() + requestPath + body)
    .digest('base64');
}

function buildQuery(params = {}) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return q ? `?${q}` : '';
}

/**
 * Signed request against the OKX V5 REST API.
 * @returns {Promise<{code:string,msg:string,data:any[]}>}
 */
export async function okxRequest(method, path, { params, body } = {}) {
  const { apiKey, secret, passphrase, simulated } = creds();
  const bodyStr = body ? JSON.stringify(body) : '';
  const requestPath = path + (method.toUpperCase() === 'GET' ? buildQuery(params) : '');
  const timestamp = new Date().toISOString(); // millisecond ISO — accepted by OKX

  const headers = {
    'OK-ACCESS-KEY': apiKey,
    'OK-ACCESS-SIGN': sign({ secret, timestamp, method, requestPath, body: bodyStr }),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'Content-Type': 'application/json',
  };
  if (simulated) headers['x-simulated-trading'] = '1';

  const res = await fetch(BASE + requestPath, {
    method,
    headers,
    body: method.toUpperCase() === 'GET' ? undefined : bodyStr,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OKX ${method} ${path} -> non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`OKX ${method} ${path} HTTP ${res.status}: ${json.msg || text.slice(0, 200)}`);
  }
  if (json.code && json.code !== '0') {
    const err = new Error(`OKX ${method} ${path} code ${json.code}: ${json.msg}`);
    err.okxCode = json.code;
    throw err;
  }
  return json;
}

// Simple rate limiter: never exceed `max` calls per `windowMs`.
export function rateLimiter(max, windowMs) {
  const stamps = [];
  return async function throttle() {
    for (;;) {
      const now = Date.now();
      while (stamps.length && now - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length < max) {
        stamps.push(now);
        return;
      }
      await sleep(windowMs - (now - stamps[0]) + 5);
    }
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
