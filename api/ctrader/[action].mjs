// api/ctrader/[action].mjs
// ──────────────────────────────────────────────────────────────────
// cTrader live-feed READ routes for the dashboard:
//   GET /api/ctrader/live     → latest snapshot per account (session-gated)
//   GET /api/ctrader/history  → equity/balance time-series for the chart
//
// Writes no longer go through an HTTP ingest endpoint. The cTrader Open API
// bridge (bridge/ctrader/) writes account_live / account_live_history directly
// with the Supabase service-role key — replacing the old cBot + /ingest path.
// ──────────────────────────────────────────────────────────────────
import { send, getSupabase, requireSession } from './_helpers.mjs';

async function live(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!requireSession(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return send(res, 200, { error: 'missing_supabase_env', accounts: [] });

  try {
    let q = supabase
      .from('account_live')
      .select('account, ctid_trader_account_id, balance, equity, floating_pnl, open_positions, margin_used, day_equity_high, day_equity_low, start_of_day_equity, start_of_day_balance, server_day, updated_at');

    const account = req.query?.account;
    if (account) q = q.eq('account', String(account));

    const { data, error } = await q;
    if (error) return send(res, 200, { error: 'live_read_failed', msg: error.message, accounts: [] });
    return send(res, 200, { accounts: data || [], count: (data || []).length, ts: Date.now() });
  } catch (e) {
    return send(res, 200, { error: 'live_read_threw', msg: e?.message || String(e), accounts: [] });
  }
}

async function history(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!requireSession(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return send(res, 200, { error: 'missing_supabase_env', points: [] });

  const account = req.query?.account;
  if (!account) return send(res, 400, { error: 'missing_account', points: [] });
  const raw = parseInt(req.query?.limit, 10);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 5000) : 500;

  try {
    const { data, error } = await supabase
      .from('account_live_history')
      .select('ts, balance, equity, floating_pnl')
      .eq('account', String(account))
      .order('ts', { ascending: false })
      .limit(limit);
    if (error) return send(res, 200, { error: 'history_read_failed', msg: error.message, points: [] });
    return send(res, 200, { points: (data || []).slice().reverse(), count: (data || []).length });
  } catch (e) {
    return send(res, 200, { error: 'history_read_threw', msg: e?.message || String(e), points: [] });
  }
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '').toLowerCase();
  if (action === 'live') return live(req, res);
  if (action === 'history') return history(req, res);
  return send(res, 404, { error: 'not_found' });
}
