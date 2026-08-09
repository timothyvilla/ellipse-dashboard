// api/auth/login.mjs
// POST { password } → sets an httpOnly session cookie on success.
import {
  authConfigured,
  passwordMatches,
  buildSessionCookie,
} from './_session.mjs';

// Brief in-memory throttle. Serverless instances are ephemeral and not shared,
// so this is a speed bump against casual brute force, not a real rate limiter.
// Move to Upstash/Redis if the deployment is ever genuinely exposed.
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

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

  // Vercel parses JSON bodies automatically, but tolerate a raw string too.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  if (!passwordMatches(body?.password)) {
    return res.status(401).json({ error: 'invalid_password', msg: 'Incorrect password.' });
  }

  attempts.delete(ip);
  res.setHeader('Set-Cookie', buildSessionCookie());
  return res.status(200).json({ ok: true });
}
