// api/okx/positions.js
// Returns open derivatives positions (perps/futures) with unrealized PnL.
// GET /api/okx/positions
import { okxGet, send } from './_okx.mjs';
import { requireSession } from '../_auth.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  // Private data: live equity, positions, fills. Requires a valid session cookie.
  if (!requireSession(req, res)) return;

  // ?account=<subAcct> signs as that sub-account; omitted/'main' uses the master key.
  const account = req.query?.account || 'main';
  // instType=SWAP covers perpetual swaps; FUTURES covers dated futures.
  const { status, body } = await okxGet('/api/v5/account/positions?instType=SWAP', account);

  if (body?.error === 'no_subaccount_credentials') return send(res, 400, body);
  if (body?.code && body.code !== '0') {
    return send(res, 502, { error: 'okx_error', code: body.code, msg: body.msg, raw: body });
  }

  const numOrNull = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n !== 0 ? n : null; };

  const positions = (body?.data || [])
    .filter((p) => parseFloat(p.pos) !== 0)
    .map((p) => {
      // Position-attached TP/SL live here, NOT in the algo-orders endpoint.
      // When you set "TP/SL" on a position in OKX, it lands in closeOrderAlgo.
      const attach = Array.isArray(p.closeOrderAlgo) ? p.closeOrderAlgo[0] : null;
      return {
        instId: p.instId,
        posSide: p.posSide,                 // long | short | net
        pos: parseFloat(p.pos) || 0,        // position size (contracts)
        avgPx: parseFloat(p.avgPx) || 0,    // average entry price
        markPx: parseFloat(p.markPx) || 0,  // current mark price
        upl: parseFloat(p.upl) || 0,        // unrealized PnL (USD)
        uplRatio: parseFloat(p.uplRatio) || 0,
        lever: parseFloat(p.lever) || 0,
        liqPx: parseFloat(p.liqPx) || 0,    // liquidation price
        margin: parseFloat(p.margin) || parseFloat(p.imr) || 0,
        notionalUsd: parseFloat(p.notionalUsd) || 0,
        // Attached stop / target (from closeOrderAlgo) — the usual place a
        // trader's position TP/SL actually lives.
        slTriggerPx: attach ? numOrNull(attach.slTriggerPx) : null,
        tpTriggerPx: attach ? numOrNull(attach.tpTriggerPx) : null,
        closeOrderAlgo: Array.isArray(p.closeOrderAlgo) ? p.closeOrderAlgo : [],
      };
    });

  return send(res, status, { positions, account, ts: Date.now() });
}
