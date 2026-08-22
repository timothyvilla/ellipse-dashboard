// _oauth.mjs
// ──────────────────────────────────────────────────────────────────
// cTrader Open API OAuth 2.0 (endpoints per Spotware's official SDK):
//   AUTH  https://openapi.ctrader.com/apps/auth?client_id=..&redirect_uri=..&scope=accounts
//   TOKEN https://openapi.ctrader.com/apps/token  (GET with query params)
//
// scope=accounts  -> READ-ONLY (view). This bridge only ever needs read access;
// never request scope=trading for a funded/prop account.
//
// Tokens are persisted to ./.tokens.json (gitignored). The access token is
// short-lived; refresh() rotates both tokens and the file. Secrets come from
// env only — nothing here ever touches the React bundle.
// ──────────────────────────────────────────────────────────────────
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const TOKENS_PATH = join(__dirname, '.tokens.json');

export const AUTH_URI = 'https://openapi.ctrader.com/apps/auth';
export const TOKEN_URI = 'https://openapi.ctrader.com/apps/token';

export function authUrl({ clientId, redirectUri, scope = 'accounts' }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope });
  return `${AUTH_URI}?${q.toString()}`;
}

async function tokenRequest(params) {
  const url = `${TOKEN_URI}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  const json = await res.json().catch(() => ({}));
  // cTrader returns { errorCode, description } on failure (HTTP 200), or the token set on success.
  if (json.errorCode || json.error) {
    throw new Error(`token endpoint: ${json.errorCode || json.error} ${json.description || json.error_description || ''}`.trim());
  }
  if (!json.accessToken && !json.access_token) {
    throw new Error(`token endpoint returned no accessToken: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return normalize(json);
}

// The endpoint has used both camelCase and snake_case over time — accept either.
function normalize(j) {
  return {
    accessToken: j.accessToken || j.access_token,
    refreshToken: j.refreshToken || j.refresh_token,
    tokenType: j.tokenType || j.token_type || 'bearer',
    expiresIn: Number(j.expiresIn ?? j.expires_in ?? 0),
    obtainedAt: Date.now(),
  };
}

/** Exchange a one-time authorization code for the initial token set. */
export function exchangeCode({ clientId, clientSecret, redirectUri, code }) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

/** Rotate the access (and refresh) token using the current refresh token. */
export function refreshTokens({ clientId, clientSecret, refreshToken }) {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
}

export async function saveTokens(tokens) {
  await writeFile(TOKENS_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

export async function loadTokens() {
  // Env overrides the file (handy for a headless host); otherwise read .tokens.json.
  if (process.env.CTRADER_ACCESS_TOKEN && process.env.CTRADER_REFRESH_TOKEN) {
    return {
      accessToken: process.env.CTRADER_ACCESS_TOKEN,
      refreshToken: process.env.CTRADER_REFRESH_TOKEN,
      tokenType: 'bearer',
      expiresIn: Number(process.env.CTRADER_TOKEN_EXPIRES_IN || 0),
      obtainedAt: Number(process.env.CTRADER_TOKEN_OBTAINED_AT || 0) || 0,
    };
  }
  try {
    return JSON.parse(await readFile(TOKENS_PATH, 'utf8'));
  } catch {
    return null;
  }
}
