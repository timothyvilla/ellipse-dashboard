// api/ctrader/live.mjs
// ──────────────────────────────────────────────────────────────────
// READ endpoint for the dashboard. Returns the latest live snapshot per
// account from account_live. Session-gated (browser cookie), served with the
// service-role key — same pattern as /api/okx/snapshots.
//
// GET /api/ctrader/live            -> all accounts
// GET /api/ctrader/live?account=x  -> one account
// ──────────────────────────────────────────────────────────────────
import { send, getSupabase, requireSession } from './_helpers.mjs';

export default async function handler(req, res) {
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
