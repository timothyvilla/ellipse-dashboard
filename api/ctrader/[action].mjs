// api/ctrader/[action].mjs
// ──────────────────────────────────────────────────────────────────
// Consolidated cTrader live-feed routes — one serverless function serving:
//   POST /api/ctrader/ingest → cBot write (Bearer CTRADER_INGEST_KEY)
//   GET  /api/ctrader/live    → dashboard read (session-gated)
// via Vercel's dynamic segment (req.query.action). Merged from the former
// ingest.mjs / live.mjs to stay under the Hobby-plan 12-function limit; URLs
// are unchanged so the cBot and app need no edits.
// ──────────────────────────────────────────────────────────────────
import { send, getSupabase, requireIngestKey, requireSession, serverDay } from './_helpers.mjs';

async function ingest(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!requireIngestKey(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return send(res, 500, { error: 'missing_supabase_env' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'bad_body' });

  const account = String(body.accountLabel || '').trim();
  if (!account) return send(res, 400, { error: 'missing_account_label' });

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const balance = num(body.balance);
  const equity = num(body.equity);
  const floating = num(body.floatingPnl);
  const marginUsed = num(body.marginUsed);
  const positions = Array.isArray(body.positions) ? body.positions.slice(0, 500) : [];

  const stamp = body.utcTime ? new Date(body.utcTime) : new Date();
  const today = serverDay(isNaN(stamp) ? new Date() : stamp);

  try {
    const { data: existing } = await supabase
      .from('account_live')
      .select('server_day, day_equity_high, day_equity_low, start_of_day_equity, start_of_day_balance, last_history_ts')
      .eq('account', account)
      .maybeSingle();

    let dayHigh, dayLow, sodEquity, sodBalance;
    if (!existing || existing.server_day !== today) {
      dayHigh = equity; dayLow = equity; sodEquity = equity; sodBalance = balance;
    } else {
      dayHigh = Math.max(Number(existing.day_equity_high ?? equity), equity);
      dayLow = Math.min(Number(existing.day_equity_low ?? equity), equity);
      sodEquity = existing.start_of_day_equity ?? equity;
      sodBalance = existing.start_of_day_balance ?? balance;
    }

    const row = {
      account,
      ctid_trader_account_id: body.accountNumber != null ? Number(body.accountNumber) : null,
      balance, equity, floating_pnl: floating,
      open_positions: positions,
      margin_used: marginUsed,
      day_equity_high: dayHigh,
      day_equity_low: dayLow,
      start_of_day_equity: sodEquity,
      start_of_day_balance: sodBalance,
      server_day: today,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('account_live').upsert(row, { onConflict: 'account' });
    if (error) return send(res, 500, { error: 'upsert_failed', msg: error.message });

    // Best-effort time-series point (~1/min) for the equity chart. Any failure —
    // e.g. the live_history migration not run yet — is swallowed so it can never
    // break the live snapshot above. last_history_ts (on account_live) throttles it.
    try {
      const nowMs = Date.now();
      const lastHistMs = existing?.last_history_ts ? new Date(existing.last_history_ts).getTime() : 0;
      if (!lastHistMs || nowMs - lastHistMs >= 60000) {
        const nowIso = new Date().toISOString();
        const { error: hErr } = await supabase.from('account_live_history').insert({ account, ts: nowIso, balance, equity, floating_pnl: floating });
        if (!hErr) await supabase.from('account_live').update({ last_history_ts: nowIso }).eq('account', account);
      }
    } catch {}

    return send(res, 200, { ok: true, account, equity, floating_pnl: floating, server_day: today });
  } catch (e) {
    return send(res, 500, { error: 'ingest_threw', msg: e?.message || String(e) });
  }
}

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
  if (action === 'ingest') return ingest(req, res);
  if (action === 'live') return live(req, res);
  if (action === 'history') return history(req, res);
  return send(res, 404, { error: 'not_found' });
}
