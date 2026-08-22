// api/ctrader/_helpers.mjs
// ──────────────────────────────────────────────────────────────────
// Shared helpers for the cTrader live-feed READ routes. Kept in THIS directory
// (not ../) because Vercel's function bundler fails to trace parent-dir imports
// — same reason api/okx/_guard.mjs exists.
//
// account_live / account_live_history are written by the Open API bridge
// (bridge/ctrader/) with the Supabase service-role key; these routes only READ,
// gated by the browser session cookie (byte-compatible with ../_auth.mjs).
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — DB access (service role)
//   APP_PASSWORD, AUTH_SECRET                 — existing session gate
// ──────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const COOKIE_NAME = 'ellipse_session';

export function send(res, status, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(obj);
}

/** Constant-time compare that tolerates length mismatch. */
export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(Buffer.from(String(a))).digest();
  const hb = crypto.createHash('sha256').update(Buffer.from(String(b))).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ---- Browser auth (session cookie) -----------------------------------------
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
function signToken(expiresAt, secret) {
  return crypto.createHmac('sha256', secret).update(String(expiresAt)).digest('hex');
}
export function requireSession(req, res) {
  if (!authConfigured()) {
    send(res, 503, { error: 'auth_not_configured', msg: 'APP_PASSWORD and AUTH_SECRET must be set.' });
    return false;
  }
  const raw = parseCookies(req)[COOKIE_NAME];
  const dot = raw ? raw.lastIndexOf('.') : -1;
  if (dot !== -1) {
    const expiresAt = Number(raw.slice(0, dot));
    const provided = raw.slice(dot + 1);
    if (Number.isFinite(expiresAt) && Date.now() <= expiresAt &&
        safeEqual(provided, signToken(expiresAt, process.env.AUTH_SECRET))) {
      return true;
    }
  }
  send(res, 401, { error: 'unauthorized', msg: 'Sign in to access this endpoint.' });
  return false;
}
