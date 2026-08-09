// api/auth/_session.mjs
// ──────────────────────────────────────────────────────────────────
// Self-contained session helpers for the auth routes.
//
// Kept in this directory (not a shared ../_auth.mjs) so the function
// bundles reliably — same reason api/okx/_guard.mjs exists. The cookie
// format here MUST stay identical to api/okx/_guard.mjs so a session
// minted by /api/auth/login validates on the OKX routes:
//   name    : ellipse_session
//   value   : `${expiresAt}.${HMAC_SHA256(String(expiresAt), AUTH_SECRET)}`
//   attrs   : Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=30d
//
// Required env vars:
//   APP_PASSWORD   the password typed on the login screen
//   AUTH_SECRET    a long random string used to sign the cookie
// ──────────────────────────────────────────────────────────────────
import crypto from 'crypto';

const COOKIE_NAME = 'ellipse_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(Buffer.from(String(a))).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(String(b))).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function signToken(expiresAt, secret) {
  return crypto.createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
}

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function authConfigured() {
  return Boolean(process.env.APP_PASSWORD && process.env.AUTH_SECRET);
}

export function passwordMatches(candidate) {
  if (typeof candidate !== 'string' || !candidate) return false;
  return safeEqual(candidate, process.env.APP_PASSWORD);
}

export function buildSessionCookie() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = `${expiresAt}.${signToken(expiresAt, process.env.AUTH_SECRET)}`;
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ].join('; ');
}

export function buildClearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function hasValidSession(req) {
  if (!authConfigured()) return false;
  const raw = parseCookies(req)[COOKIE_NAME];
  if (!raw) return false;
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return false;
  const expiresAt = Number(raw.slice(0, dot));
  const provided = raw.slice(dot + 1);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return safeEqual(provided, signToken(expiresAt, process.env.AUTH_SECRET));
}

// Read a JSON body whether the runtime pre-parsed it or handed us a stream.
export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}
