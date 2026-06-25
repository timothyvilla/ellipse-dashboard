// api/okx/positions.js
// Returns open derivatives positions (perps/futures) with unrealized PnL.
// GET /api/okx/positions
import { okxGet, send } from './_okx.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });

  // instType=SWAP covers perpetual swaps; FUTURES covers dated futures.
  const { status, body } = await okxGet('/api/v5/account/positions?instType=SWAP');

  if (body?.code && body.code !== '0') {
    return send(res, 502, { error: 'okx_error', code: body.code, msg: body.msg, raw: body });
  }

  const positions = (body?.data || [])
    .filter((p) => parseFloat(p.pos) !== 0)
    .map((p) => ({
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
    }));

  return send(res, status, { positions, ts: Date.now() });
}
