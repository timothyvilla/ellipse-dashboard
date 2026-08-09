// api/okx/snapshots.mjs
// ──────────────────────────────────────────────────────────────────
// Server-side READ of the equity-curve history.
//
// WHY: the browser holds only the Supabase anon key and never signs into
// Supabase Auth, so once RLS is locked down (see supabase/rls_lockdown.sql)
// the client can neither write nor read crypto_snapshots. The hourly cron
// (api/cron/okx-sync.mjs) keeps writing history with the service-role key,
// but the UI had no way to read it back — so the equity curve reset to just
// the current session every reload.
//
// This route reads crypto_snapshots with the service-role key (bypasses RLS)
// and returns it to the authenticated UI. It is the durable, cross-session,
// cross-device source of truth for the equity curve.
//
// GET /api/okx/snapshots?limit=1000
//
// Required env vars (already used by the cron):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// Plus the usual session gate:
//   APP_PASSWORD, AUTH_SECRET
// ──────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { send } from './_okx.mjs';
import { requireSession } from './_guard.mjs';

const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  // Snapshots expose account equity over time — same sensitivity as balance.
  if (!requireSession(req, res)) return;

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    // Fail soft: the UI treats an error/empty result as "no server history"
    // and falls back to its localStorage cache, so the app still renders.
    return send(res, 500, {
      error: 'missing_supabase_env',
      msg: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable server-side snapshot history.',
      snapshots: [],
    });
  }

  // Clamp the limit so a crafted query can't ask for unbounded rows.
  const raw = parseInt(req.query?.limit, 10);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    // Newest `limit` rows, then return ascending so the client can plot
    // left-to-right without re-sorting. crypto_snapshots is append-only.
    const { data, error } = await supabase
      .from('crypto_snapshots')
      .select('id, ts, total_eq, upl, balances, positions, source')
      .order('ts', { ascending: false })
      .limit(limit);

    if (error) {
      // Missing table or transient error — hand back empty so the UI keeps
      // its local cache instead of blanking the curve.
      return send(res, 200, { error: 'snapshots_read_failed', msg: error.message, snapshots: [] });
    }

    const snapshots = (data || []).slice().reverse();
    return send(res, 200, { snapshots, count: snapshots.length, ts: Date.now() });
  } catch (e) {
    return send(res, 200, { error: 'snapshots_read_threw', msg: e?.message || String(e), snapshots: [] });
  }
}
