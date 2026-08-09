// api/okx/_guard.mjs
// ──────────────────────────────────────────────────────────────────
// Self-contained session guard for the OKX routes.
//
// WHY THIS EXISTS (not just importing ../_auth.mjs): Vercel's function
// bundler reliably includes SAME-directory imports (./_okx.mjs always
// worked) but was failing to trace the PARENT-directory ../_auth.mjs into
// freshly-built function bundles, producing runtime
//   ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/api/_auth.mjs'
// on every route the moment it was rebuilt. Keeping the guard in this
// directory sidesteps the tracing bug entirely.
//
// It MUST stay byte-compatible with ../_auth.mjs's cookie format
// (same COOKIE_NAME, same HMAC-over-expiresAt signature) so sessions
// issued by /api/auth/login validate here unchanged.
// ──────────────────────────────────────────────────────────────────
import crypto from 'crypto';

const COOKIE_NAME = 'ellipse_session';

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

function authConfigured() {
  return Boolean(process.env.APP_PASSWORD && process.env.AUTH_SECRET);
}

function hasValidSession(req) {
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

/** Guard for a private route. Returns true to proceed; otherwise it has
 *  already written the response. */
export function requireSession(req, res) {
  if (!authConfigured()) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'auth_not_configured', msg: 'APP_PASSWORD and AUTH_SECRET must be set on the server before this route will serve data.' });
    return false;
  }
  if (!hasValidSession(req)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.status(401).json({ error: 'unauthorized', msg: 'Sign in to access this endpoint.' });
    return false;
  }
  return true;
}
