// api/ctrader/_helpers.mjs
// ──────────────────────────────────────────────────────────────────
// Shared helpers for the cTrader live-feed routes. Kept in THIS directory
// (not ../) because Vercel's function bundler fails to trace parent-dir
// imports — same reason api/okx/_guard.mjs exists.
//
// Two very different auth models live here:
//   • requireIngestKey  — machine-to-machine (the cBot). Bearer API key in the
//                         Authorization header, compared to CTRADER_INGEST_KEY.
//   • requireSession    — the browser session cookie (byte-compatible with
//                         ../_auth.mjs), used by the read route.
//
// Env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — DB access (service role)
//   CTRADER_INGEST_KEY                        — shared secret the cBot sends
//   APP_PASSWORD, AUTH_SECRET                 — existing session gate
// ──────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const COOKIE_NAME = 'ellipse_session';
const MT5_SERVER_OFFSET_MIN = 3 * 60; // GMT+3 — keep in sync with the app's daily boundary

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

/** YYYY-MM-DD for the MT5/broker server day (GMT+3) of the given Date. */
export function serverDay(date = new Date()) {
  return new Date(date.getTime() + MT5_SERVER_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}

// ---- Machine auth (cBot) ----------------------------------------------------
/** Returns true if the request carries a valid Bearer ingest key. Otherwise it
 *  has already written the response. */
export function requireIngestKey(req, res) {
  const expected = process.env.CTRADER_INGEST_KEY;
  if (!expected) {
    send(res, 503, { error: 'ingest_not_configured', msg: 'Set CTRADER_INGEST_KEY on the server.' });
    return false;
  }
  const auth = req.headers?.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !safeEqual(token, expected)) {
    send(res, 401, { error: 'unauthorized', msg: 'Bad or missing ingest key.' });
    return false;
  }
  return true;
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
