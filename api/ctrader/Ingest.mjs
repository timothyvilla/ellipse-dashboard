// api/ctrader/ingest.mjs
// ──────────────────────────────────────────────────────────────────
// WRITE endpoint for the read-only cTrader cBot (EllipseLivePnl).
//
// POST /api/ctrader/ingest
//   Authorization: Bearer <CTRADER_INGEST_KEY>
//   body: {
//     accountLabel, accountNumber, currency,
//     balance, equity, floatingPnl, marginUsed,
//     serverTime, utcTime,
//     positions: [{ positionId, symbol, side, lots, volume, entry, floatPnl, swap, commission }]
//   }
//
// Upserts one row per accountLabel into account_live, and maintains the
// per-server-day (GMT+3) equity extremes the drawdown modes need:
//   • new server day  -> reset start_of_day_* and day high/low to the incoming values
//   • same server day -> extend day_equity_high / day_equity_low
//
// Written with the service-role key (RLS is otherwise closed on account_live).
// ──────────────────────────────────────────────────────────────────
import { send, getSupabase, requireIngestKey, serverDay } from './_helpers.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!requireIngestKey(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return send(res, 500, { error: 'missing_supabase_env' });

  // Vercel parses JSON bodies automatically; tolerate a raw string too.
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

  // Trust the cBot's server timestamp when present; else derive from now().
  const stamp = body.utcTime ? new Date(body.utcTime) : new Date();
  const today = serverDay(isNaN(stamp) ? new Date() : stamp);

  try {
    const { data: existing } = await supabase
      .from('account_live')
      .select('server_day, day_equity_high, day_equity_low, start_of_day_equity, start_of_day_balance')
      .eq('account', account)
      .maybeSingle();

    let dayHigh, dayLow, sodEquity, sodBalance;
    if (!existing || existing.server_day !== today) {
      // New server day (or first ever snapshot): reset the day's baselines.
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

    return send(res, 200, { ok: true, account, equity, floating_pnl: floating, server_day: today });
  } catch (e) {
    return send(res, 500, { error: 'ingest_threw', msg: e?.message || String(e) });
  }
}