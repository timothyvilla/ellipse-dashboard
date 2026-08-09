// api/okx/fills.js
// Returns recent trade fills (executed trades) for derivatives.
// OKX fills-history covers roughly the last 3 months.
// GET /api/okx/fills?limit=100
import { okxGet, send } from './_okx.mjs';
import { requireSession } from './_guard.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  // Private data: live equity, positions, fills. Requires a valid session cookie.
  if (!requireSession(req, res)) return;

  const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 100);
  // ?account=<subAcct> signs as that sub-account; omitted/'main' uses the master key.
  const account = req.query?.account || 'main';
  const path = `/api/v5/trade/fills-history?instType=SWAP&limit=${limit}`;
  const { status, body } = await okxGet(path, account);

  if (body?.error === 'no_subaccount_credentials') return send(res, 400, body);
  if (body?.code && body.code !== '0') {
    return send(res, 502, { error: 'okx_error', code: body.code, msg: body.msg, raw: body });
  }

  const fills = (body?.data || []).map((f) => ({
    tradeId: f.tradeId,                 // unique fill id (used for dedupe)
    ordId: f.ordId,
    instId: f.instId,                   // e.g. BTC-USDT-SWAP
    side: f.side,                       // buy | sell
    posSide: f.posSide,                 // long | short | net
    fillSz: parseFloat(f.fillSz) || 0,  // size filled (contracts)
    fillPx: parseFloat(f.fillPx) || 0,  // fill price
    fillPnl: parseFloat(f.fillPnl) || 0,// realized PnL for this fill (USD)
    fee: parseFloat(f.fee) || 0,        // negative = fee paid
    feeCcy: f.feeCcy || '',
    execType: f.execType,               // T (taker) | M (maker)
    ts: parseInt(f.ts, 10) || Date.now(),
  }));

  return send(res, status, { fills, account, ts: Date.now() });
}
