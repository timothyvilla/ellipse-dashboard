// api/okx/balance.js
// Returns the unified account balance (total equity + per-coin details).
// GET /api/okx/balance
import { okxGet, send } from './_okx.mjs';
import { requireSession } from './_guard.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  // Private data: live equity, positions, fills. Requires a valid session cookie.
  if (!requireSession(req, res)) return;

  // ?account=<subAcct> signs as that sub-account; omitted/'main' uses the master key.
  const account = req.query?.account || 'main';
  const { status, body } = await okxGet('/api/v5/account/balance', account);

  if (body?.error === 'no_subaccount_credentials') return send(res, 400, body);
  if (body?.code && body.code !== '0') {
    return send(res, 502, { error: 'okx_error', code: body.code, msg: body.msg, raw: body });
  }

  const acct = body?.data?.[0] || {};
  const details = (acct.details || []).map((d) => ({
    ccy: d.ccy,
    eq: parseFloat(d.eq) || 0,            // equity of the coin in coin units
    eqUsd: parseFloat(d.eqUsd) || 0,      // equity in USD
    availBal: parseFloat(d.availBal) || 0,
    upl: parseFloat(d.upl) || 0,          // unrealized PnL
  }));

  return send(res, status, {
    totalEq: parseFloat(acct.totalEq) || 0,   // total account equity in USD
    isoEq: parseFloat(acct.isoEq) || 0,
    upl: parseFloat(acct.upl) || 0,
    details: details.filter((d) => d.eqUsd > 0.01 || d.eq !== 0),
    account,
    ts: Date.now(),
  });
}
