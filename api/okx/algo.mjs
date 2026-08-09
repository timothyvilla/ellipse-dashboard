// api/okx/algo.mjs
// ──────────────────────────────────────────────────────────────────
// Stop-loss / take-profit (algo orders) for the crypto dashboard.
//
// WHY a separate route: OKX does NOT include SL/TP in the positions or
// fills endpoints. SL/TP are "algo orders", so they live on their own
// endpoints. Pulling them is what lets the app compute real risk/reward:
//   risk (1R) = |entry − stopLoss|,  reward = |takeProfit − entry|.
//
//   GET /api/okx/algo?account=<sub|main>
//   -> {
//        live:    [ { instId, side, posSide, sz, slTriggerPx, slOrdPx,
//                     tpTriggerPx, tpOrdPx, algoId, ordType, state } ],
//        history: [ { ...same, state, triggerPx, triggerTime, cTime } ],
//        ts
//      }
//
// LIMITATION: for a SUB-ACCOUNT, OKX only serves algo orders to a key
// created inside that sub-account — same rule as fills/positions. Pass
// ?account=<name> and configure OKX_SUB_ACCOUNTS (see _okx.mjs). Without
// it, this returns the master account's algo orders only.
// ──────────────────────────────────────────────────────────────────
import { okxGet, send } from './_okx.mjs';
import { requireSession } from './_guard.mjs';

// OKX splits attached/standalone stops across these algo order types.
// conditional = single SL or TP; oco = one-cancels-other (SL + TP together);
// trigger = trigger order; move_order_stop = trailing stop. Query all so any
// stop/target the account has set is caught regardless of how it was placed.
const LIVE_ORD_TYPES = ['conditional', 'oco', 'trigger', 'move_order_stop'];
const HIST_ORD_TYPES = ['conditional', 'oco', 'trigger'];

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// Normalize one OKX algo-order row to the fields the dashboard needs.
function mapAlgo(o) {
  return {
    algoId: o.algoId,
    instId: o.instId,
    instType: o.instType,
    ordType: o.ordType,
    side: o.side,                 // buy | sell
    posSide: o.posSide,           // long | short | net
    sz: num(o.sz),
    slTriggerPx: num(o.slTriggerPx),
    slOrdPx: num(o.slOrdPx),      // -1 in OKX means "market" — surfaced as -1
    tpTriggerPx: num(o.tpTriggerPx),
    tpOrdPx: num(o.tpOrdPx),
    state: o.state,               // live | effective | canceled | order_failed | pause
    triggerPx: num(o.triggerPx),
    actualPx: num(o.actualPx),
    triggerTime: o.triggerTime ? Number(o.triggerTime) : null,
    cTime: o.cTime ? Number(o.cTime) : null,
  };
}

// Fetch one ordType from one endpoint; never throw — a permission error on
// one type must not sink the others. Returns [] on any non-zero OKX code.
async function fetchAlgo(basePath, ordType, account, extraQs = '') {
  try {
    const qs = `ordType=${ordType}${extraQs ? '&' + extraQs : ''}`;
    const { body } = await okxGet(`${basePath}?${qs}`, account);
    if (body?.code && body.code !== '0') return { rows: [], err: body.msg || `code ${body.code}` };
    return { rows: (body?.data || []).map(mapAlgo), err: null };
  } catch (e) {
    return { rows: [], err: e?.message || 'request failed' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  // Private data (mirrors balance/positions/fills). Requires a session cookie.
  if (!requireSession(req, res)) return;

  const account = req.query?.account || 'main';

  // Live SL/TP currently attached to open positions.
  const liveResults = await Promise.all(
    LIVE_ORD_TYPES.map((t) => fetchAlgo('/api/v5/trade/orders-algo-pending', t, account))
  );
  // Historical SL/TP — state=effective means the stop/target actually fired,
  // which is what we pair with closed trades to get a realized R multiple.
  const histResults = await Promise.all(
    HIST_ORD_TYPES.map((t) => fetchAlgo('/api/v5/trade/orders-algo-history', t, account, 'state=effective&limit=100'))
  );

  // Working (pending, not-yet-filled) regular orders — these are the "entry
  // orders" resting on the book, along with any SL/TP attached to them.
  let pending = [];
  let pendingErr = null;
  try {
    const { body } = await okxGet('/api/v5/trade/orders-pending?instType=SWAP', account);
    if (body?.code && body.code !== '0') {
      pendingErr = body.msg || `code ${body.code}`;
    } else {
      pending = (body?.data || []).map((o) => ({
        ordId: o.ordId,
        instId: o.instId,
        ordType: o.ordType,        // limit | post_only | fok | ioc | market
        side: o.side,              // buy | sell
        posSide: o.posSide,
        px: num(o.px),             // limit / entry price
        sz: num(o.sz),
        state: o.state,            // live | partially_filled
        slTriggerPx: num(o.slTriggerPx),
        tpTriggerPx: num(o.tpTriggerPx),
        cTime: o.cTime ? Number(o.cTime) : null,
      }));
    }
  } catch (e) { pendingErr = e?.message || 'orders-pending failed'; }

  const live = liveResults.flatMap((r) => r.rows);
  const history = histResults.flatMap((r) => r.rows);
  const errors = [...liveResults, ...histResults].map((r) => r.err).filter(Boolean);
  if (pendingErr) errors.push(pendingErr);

  return send(res, 200, {
    account,
    live,        // standalone/attached SL/TP algo orders on open positions
    history,     // effective (triggered) stops/targets for closed trades
    pending,     // working regular entry orders (with any attached SL/TP)
    // Surface (don't throw) permission/param errors so the UI can hint at
    // "create a read-only key with order-read permission" without breaking.
    warnings: errors.length ? errors : undefined,
    ts: Date.now(),
  });
}
