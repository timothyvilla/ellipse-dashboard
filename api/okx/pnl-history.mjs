// api/okx/pnl-history.mjs
// ──────────────────────────────────────────────────────────────────
// Closed-position realized P&L — the basis for Net P&L, win rate,
// profit factor, the P&L charts, and the calendar.
//
// WHY THIS ROUTE EXISTS: the dashboard calls /api/okx/pnl-history on every
// sync (App.jsx -> setCryptoPnl). Without it, cryptoPnl stays empty and the
// analytics silently fall back to raw fills — which drags funding fees and
// dust rows into the graded "Recent Trades." Serving real closed positions
// here makes P&L match what OKX reports and keeps funding OUT of trades
// (funding is carry cost, surfaced separately by /api/okx/funding).
//
//   GET /api/okx/pnl-history?account=<sub|main>
//   -> { positions: [{ instId, direction, net, gross, fee, fundingFee,
//                       closeTs, openTs, posId, lever, ccy }], account, ts }
//
// `net` = OKX realizedPnl (pnl + fee + fundingFee + liqPenalty + settledPnl),
// i.e. fees IN and funding OUT — the number OKX shows for the closed position.
//
// TIERS:
//   • Live: OKX /account/positions-history covers ~the last 3 months.
//   • Deep: if crypto_positions_history has older rows (written by the hourly
//     cron and/or the one-time since-2021 backfill), they're merged in here,
//     deduped by posId — so the window extends past 3 months without the
//     dashboard ever retaining anything in session state.
// ──────────────────────────────────────────────────────────────────
import { okxGet, send } from './_okx.mjs';
import { requireSession } from './_guard.mjs';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/** Pull all closed positions from OKX, paging back by uTime (100/page, 10 req/2s). */
async function fetchLivePositions(account) {
  const out = [];
  let after; // cursor = uTime of the last row returned
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ instType: 'SWAP', limit: '100' });
    if (after) qs.set('after', after);
    const { body } = await okxGet(`/api/v5/account/positions-history?${qs.toString()}`, account);
    if (body?.error === 'no_subaccount_credentials') return { error: body };
    if (body?.code && body.code !== '0') return { error: { code: body.code, msg: body.msg, raw: body } };
    const data = body?.data || [];
    for (const p of data) {
      out.push({
        instId: p.instId,
        direction: p.posSide,                 // long | short | net
        net: num(p.realizedPnl),              // fees in, funding out
        gross: num(p.pnl),                    // excluding fees
        fee: num(p.fee),
        fundingFee: num(p.fundingFee),
        closeTs: Number(p.uTime) || null,
        openTs: Number(p.cTime) || null,
        posId: p.posId,
        lever: num(p.lever),
        ccy: p.ccy,
      });
    }
    if (data.length < 100) break;
    after = data[data.length - 1].uTime;
  }
  return { positions: out };
}

/** Merge in persisted rows older than the live window (best-effort). */
async function mergeDeepHistory(livePositions, account) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || account !== 'main') return livePositions; // deep history is persisted for the main account only

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('crypto_positions_history')
      .select('pos_id, inst_id, pos_side, realized_pnl, pnl, fee, funding_fee, close_time, open_time, lever, ccy')
      .order('close_time', { ascending: false })
      .limit(5000);
    if (error || !data?.length) return livePositions;

    const seen = new Set(livePositions.map((p) => p.posId));
    const persisted = data
      .filter((r) => !seen.has(r.pos_id))
      .map((r) => ({
        instId: r.inst_id,
        direction: r.pos_side,
        net: num(r.realized_pnl),
        gross: num(r.pnl),
        fee: num(r.fee),
        fundingFee: num(r.funding_fee),
        closeTs: r.close_time ? Date.parse(r.close_time) : null,
        openTs: r.open_time ? Date.parse(r.open_time) : null,
        posId: r.pos_id,
        lever: num(r.lever),
        ccy: r.ccy,
      }));
    return [...livePositions, ...persisted].sort((a, b) => (b.closeTs || 0) - (a.closeTs || 0));
  } catch {
    return livePositions; // never let deep-history read break the live route
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!requireSession(req, res)) return;

  const account = req.query?.account || 'main';

  const live = await fetchLivePositions(account);
  if (live.error) {
    if (live.error.error === 'no_subaccount_credentials') return send(res, 400, live.error);
    return send(res, 502, { error: 'okx_error', ...live.error });
  }

  const positions = await mergeDeepHistory(live.positions, account);
  return send(res, 200, { positions, account, ts: Date.now() });
}
