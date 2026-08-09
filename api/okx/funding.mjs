// api/okx/funding.mjs
// ──────────────────────────────────────────────────────────────────
// Perpetual funding-fee expense, separated from trade P&L.
//
// WHY: funding is the cost of *holding* a perp, not a trade. OKX never
// returns it in fills-history (those are execType T/M trades only) — it
// lives in the account bills ledger under type "8" (funding fee). So a
// dashboard that only reads fills silently mixes trading edge with the
// carry cost of holding positions. This route pulls funding out on its own.
//
//   GET /api/okx/funding?account=<sub|main>
//   -> { totalFunding, count, byInst: {INST: amount}, recent: [...], ts }
//
// balChg is the signed cash flow: negative = funding paid, positive = received.
// OKX /account/bills covers ~the last 7 days; older funding needs
// /account/bills-archive (not fetched here to keep it a single fast call).
// ──────────────────────────────────────────────────────────────────
import { okxGet, send } from './_okx.mjs';
import { requireSession } from '../_auth.mjs';

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!requireSession(req, res)) return;

  const account = req.query?.account || 'main';

  try {
    // type=8 → funding fee. instType=SWAP scopes to perpetuals.
    const { body } = await okxGet('/api/v5/account/bills?instType=SWAP&type=8&limit=100', account);
    if (body?.code && body.code !== '0') {
      return send(res, 200, { error: 'funding_read_failed', msg: body.msg || `code ${body.code}`, totalFunding: 0, count: 0, byInst: {}, recent: [] });
    }

    const rows = (body?.data || []).map((b) => ({
      instId: b.instId,
      amount: num(b.balChg) || num(b.pnl),   // signed funding cash flow (USDT)
      ccy: b.ccy,
      ts: b.ts ? Number(b.ts) : null,
    }));

    const byInst = {};
    let totalFunding = 0;
    for (const r of rows) {
      totalFunding += r.amount;
      byInst[r.instId] = (byInst[r.instId] || 0) + r.amount;
    }

    return send(res, 200, {
      account,
      totalFunding,                              // negative = net funding paid
      count: rows.length,
      byInst,
      recent: rows.slice(0, 25),
      ts: Date.now(),
    });
  } catch (e) {
    return send(res, 200, { error: 'funding_threw', msg: e?.message || String(e), totalFunding: 0, count: 0, byInst: {}, recent: [] });
  }
}
