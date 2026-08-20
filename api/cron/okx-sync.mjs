// api/cron/okx-sync.mjs
// ──────────────────────────────────────────────────────────────────
// Server-side hourly OKX sync. Runs independently of the browser.
// Pulls balance + positions + fills from OKX and writes to Supabase:
//   - upserts fills into crypto_trades (deduped on trade_id)
//   - writes a crypto_snapshots row (powers the equity curve)
//   - updates active crypto_challenges' current_balance
//   - upserts CLOSED positions into crypto_positions_history (realized P&L
//     history that survives past OKX's ~3-month live window)
//
// Triggered by a scheduler (Vercel Cron or GitHub Actions) that calls
// this URL hourly. Protected by CRON_SECRET.
//
// Required Vercel env vars:
//   OKX_API_KEY, OKX_API_SECRET, OKX_API_PASSPHRASE   (read-only key)
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Settings → API → service_role
//   CRON_SECRET                  any long random string
// ──────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import { okxGet } from '../okx/_okx.mjs';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  // ---- Auth: require CRON_SECRET (header or ?key=) if it's configured ----
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const key = bearer || req.query?.key || '';
    if (key !== secret) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'missing_supabase_env', msg: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    // ---- Pull from OKX ----
    const [bal, pos, fillsRes] = await Promise.all([
      okxGet('/api/v5/account/balance'),
      okxGet('/api/v5/account/positions?instType=SWAP'),
      okxGet('/api/v5/trade/fills-history?instType=SWAP&limit=100'),
    ]);

    for (const [name, r] of [['balance', bal], ['positions', pos], ['fills', fillsRes]]) {
      if (r.body?.code && r.body.code !== '0') {
        return res.status(502).json({ error: 'okx_error', endpoint: name, code: r.body.code, msg: r.body.msg });
      }
    }

    const acct = bal.body?.data?.[0] || {};
    const totalEq = parseFloat(acct.totalEq) || 0;
    const upl = parseFloat(acct.upl) || 0;
    const details = (acct.details || []).map((d) => ({
      ccy: d.ccy, eq: parseFloat(d.eq) || 0, eqUsd: parseFloat(d.eqUsd) || 0,
      availBal: parseFloat(d.availBal) || 0, upl: parseFloat(d.upl) || 0,
    })).filter((d) => d.eqUsd > 0.01 || d.eq !== 0);

    const positions = (pos.body?.data || [])
      .filter((p) => parseFloat(p.pos) !== 0)
      .map((p) => ({
        instId: p.instId, posSide: p.posSide, pos: parseFloat(p.pos) || 0,
        avgPx: parseFloat(p.avgPx) || 0, markPx: parseFloat(p.markPx) || 0,
        upl: parseFloat(p.upl) || 0, lever: parseFloat(p.lever) || 0,
        liqPx: parseFloat(p.liqPx) || 0, notionalUsd: parseFloat(p.notionalUsd) || 0,
      }));

    const fills = (fillsRes.body?.data || []).filter((f) => f.tradeId).map((f) => ({
      trade_id: f.tradeId, ord_id: f.ordId, inst_id: f.instId, side: f.side,
      pos_side: f.posSide, fill_sz: parseFloat(f.fillSz) || 0, fill_px: parseFloat(f.fillPx) || 0,
      pnl: parseFloat(f.fillPnl) || 0, fee: parseFloat(f.fee) || 0, fee_ccy: f.feeCcy || '',
      exec_type: f.execType, ts: new Date(parseInt(f.ts, 10) || Date.now()).toISOString(), source: 'okx',
    }));

    // ---- Write to Supabase ----
    let insertedFills = 0;
    if (fills.length) {
      const { data, error } = await supabase
        .from('crypto_trades')
        .upsert(fills, { onConflict: 'trade_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error('crypto_trades upsert: ' + error.message);
      insertedFills = data?.length || 0;
    }

    const { error: snapErr } = await supabase.from('crypto_snapshots').insert({
      ts: new Date().toISOString(), total_eq: totalEq, upl, balances: details, positions, source: 'okx',
    });
    if (snapErr) throw new Error('crypto_snapshots insert: ' + snapErr.message);

    // ---- Update active challenges with live equity ----
    let challengesUpdated = 0;
    const { data: active } = await supabase.from('crypto_challenges').select('id').eq('status', 'active');
    if (active?.length) {
      const { error: chErr } = await supabase
        .from('crypto_challenges')
        .update({ current_balance: totalEq, updated_at: new Date().toISOString() })
        .eq('status', 'active');
      if (!chErr) challengesUpdated = active.length;
    }

    // ---- Persist CLOSED positions (realized P&L history) ----------------
    // Best-effort: closed-position history is what powers Net P&L / calendar
    // beyond OKX's ~3-month live window. Wrapped so a schema/permission issue
    // here can never fail the core balance/fills/snapshot sync above.
    let positionsPersisted = 0;
    try {
      const ph = await okxGet('/api/v5/account/positions-history?instType=SWAP&limit=100');
      if (!(ph.body?.code && ph.body.code !== '0')) {
        const rows = (ph.body?.data || []).filter((p) => p.posId).map((p) => ({
          pos_id: p.posId, inst_id: p.instId, inst_type: p.instType, pos_side: p.posSide,
          lever: num(p.lever), open_avg_px: num(p.openAvgPx), close_avg_px: num(p.closeAvgPx),
          open_time: p.cTime ? new Date(Number(p.cTime)).toISOString() : null,
          close_time: p.uTime ? new Date(Number(p.uTime)).toISOString() : null,
          realized_pnl: num(p.realizedPnl), pnl: num(p.pnl), fee: num(p.fee),
          funding_fee: num(p.fundingFee), liq_penalty: num(p.liqPenalty), pnl_ratio: num(p.pnlRatio),
          ccy: p.ccy, source: 'cron', raw: p,
        }));
        if (rows.length) {
          const { data, error } = await supabase
            .from('crypto_positions_history')
            .upsert(rows, { onConflict: 'pos_id' })
            .select('pos_id');
          if (!error) positionsPersisted = data?.length || rows.length;
        }
      }
    } catch { /* non-fatal */ }

    return res.status(200).json({
      ok: true, ts: Date.now(), totalEq, openPositions: positions.length,
      fillsSeen: fills.length, fillsInserted: insertedFills, challengesUpdated, positionsPersisted,
    });
  } catch (e) {
    return res.status(500).json({ error: 'sync_failed', msg: e.message });
  }
}
