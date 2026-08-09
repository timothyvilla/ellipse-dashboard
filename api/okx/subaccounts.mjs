// api/okx/subaccounts.mjs
// ──────────────────────────────────────────────────────────────────
// Lists OKX sub-accounts and their trading-account equity, using the
// MASTER read-only API key. No extra credentials required.
//
//   GET /api/okx/subaccounts
//   -> { accounts: [{ subAcct, label, enable, totalEq, upl, details[], error? }], ts }
//
// LIMITATION (OKX v5): a master key can read sub-account *balances* only.
// There is no `subAcct` parameter on /api/v5/trade/fills-history or
// /api/v5/account/positions, so per-sub-account trades and open positions
// require a read-only key created inside each sub-account. This route
// therefore returns balances only.
// ──────────────────────────────────────────────────────────────────
import { okxGet, send, configuredSubAccounts } from './_okx.mjs';
import { requireSession } from './_guard.mjs';

// OKX rate-limits sub-account balance reads, so fan out in small batches.
const BATCH_SIZE = 3;
const BATCH_PAUSE_MS = 250;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeBalance(body) {
  const acct = body?.data?.[0] || {};
  const details = (acct.details || [])
    .map((d) => ({
      ccy: d.ccy,
      eq: parseFloat(d.eq) || 0,
      eqUsd: parseFloat(d.eqUsd) || 0,
      availBal: parseFloat(d.availBal) || 0,
      upl: parseFloat(d.upl) || 0,
    }))
    .filter((d) => d.eqUsd > 0.01 || d.eq !== 0);
  return {
    totalEq: parseFloat(acct.totalEq) || 0,
    isoEq: parseFloat(acct.isoEq) || 0,
    upl: parseFloat(acct.upl) || 0,
    details,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  // Private data: live equity, positions, fills. Requires a valid session cookie.
  if (!requireSession(req, res)) return;

  // 1) Which sub-accounts exist?
  const list = await okxGet('/api/v5/users/subaccount/list');
  if (list.body?.code && list.body.code !== '0') {
    // 50102/50103-style permission errors land here. Surface them rather than
    // pretending the user simply has no sub-accounts.
    return send(res, 502, {
      error: 'okx_error',
      code: list.body.code,
      msg: list.body.msg || 'Could not list sub-accounts. The API key must belong to the master account.',
      accounts: [],
    });
  }

  // Accounts with their own read-only key can also serve positions + fills.
  const withKeys = new Set(configuredSubAccounts());

  const subs = (list.body?.data || []).map((s) => ({
    subAcct: s.subAcct,
    label: s.label || s.subAcct,
    enable: s.enable === true || s.enable === 'true',
    hasKeys: withKeys.has(s.subAcct),
  }));

  if (!subs.length) return send(res, 200, { accounts: [], ts: Date.now() });

  // 2) Balance per sub-account, batched. One failure must not sink the rest.
  const accounts = [];
  for (let i = 0; i < subs.length; i += BATCH_SIZE) {
    const batch = subs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (s) => {
        try {
          const { body } = await okxGet(
            `/api/v5/account/subaccount/balances?subAcct=${encodeURIComponent(s.subAcct)}`
          );
          if (body?.code && body.code !== '0') {
            return { ...s, totalEq: 0, upl: 0, details: [], error: body.msg || `OKX code ${body.code}` };
          }
          return { ...s, ...normalizeBalance(body) };
        } catch (e) {
          return { ...s, totalEq: 0, upl: 0, details: [], error: e.message || 'request failed' };
        }
      })
    );
    accounts.push(...results);
    if (i + BATCH_SIZE < subs.length) await sleep(BATCH_PAUSE_MS);
  }

  return send(res, 200, {
    accounts,
    totalEq: accounts.reduce((sum, a) => sum + (a.totalEq || 0), 0),
    ts: Date.now(),
  });
}
