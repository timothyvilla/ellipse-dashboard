// api/auth/[action].mjs
// ──────────────────────────────────────────────────────────────────
// Consolidated auth routes — one serverless function serving all three
// paths via Vercel's dynamic segment (req.query.action):
//   GET  /api/auth/session  → { configured, authenticated }
//   POST /api/auth/login    → sets session cookie ({ password, remember })
//   POST /api/auth/logout   → clears session cookie
//
// Merged from the former session.mjs / login.mjs / logout.mjs to stay under
// the Hobby-plan 12-function limit. URLs and behavior are unchanged, so the
// client needs no edits. Helpers stay in ./_session.mjs (same directory).
// ──────────────────────────────────────────────────────────────────
import {
  authConfigured,
  hasValidSession,
  passwordMatches,
  buildSessionCookie,
  buildClearCookie,
} from './_session.mjs';

// Brief in-memory throttle (per ephemeral instance) — a speed bump, not a
// real rate limiter. Carried over from the old login.mjs.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function throttled(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) {
    attempts.set(ip, { first: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > MAX_ATTEMPTS;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  const action = String(req.query?.action || '').toLowerCase();

  // ---- GET /api/auth/session ----
  if (action === 'session') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    return res.status(200).json({
      configured: authConfigured(),
      authenticated: hasValidSession(req),
    });
  }

  // ---- POST /api/auth/logout ----
  if (action === 'logout') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    res.setHeader('Set-Cookie', buildClearCookie());
    return res.status(200).json({ ok: true });
  }

  // ---- POST /api/auth/login ----
  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

    if (!authConfigured()) {
      return res.status(503).json({
        error: 'auth_not_configured',
        msg: 'Set APP_PASSWORD and AUTH_SECRET in the Vercel project environment variables.',
      });
    }

    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    if (throttled(ip)) {
      return res.status(429).json({ error: 'too_many_attempts', msg: 'Too many attempts. Try again later.' });
    }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

    if (!passwordMatches(body?.password)) {
      return res.status(401).json({ error: 'invalid_password', msg: 'Incorrect password.' });
    }

    attempts.delete(ip);
    const remember = body?.remember !== false; // default persistent unless explicitly false
    res.setHeader('Set-Cookie', buildSessionCookie(remember));
    return res.status(200).json({ ok: true });
  }

  return res.status(404).json({ error: 'not_found' });
}
