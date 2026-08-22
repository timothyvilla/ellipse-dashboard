#!/usr/bin/env node
// bridge.mjs
// ──────────────────────────────────────────────────────────────────
// cTrader Open API → Supabase live-P&L bridge. Replaces the old cTrader
// cBot: a small always-on (or scheduled) Node process that keeps a
// read-only Open API socket open, computes equity / floating P&L per
// account, and upserts account_live + account_live_history — the exact
// tables the dashboard already reads via /api/ctrader/live & /history.
//
// Modes (env MODE):
//   stream    (default) — poll every POLL_MS forever; reconnect on drop.
//   snapshot            — one full cycle for every account, then exit 0
//                         (use with Windows Task Scheduler / cron).
//
// Nothing here can place or close an order: the token scope is `accounts`
// (read-only) and the client only ever sends read requests.
// ──────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { CTraderClient } from './_client.mjs';
import { supa, serverDay } from './_supabase.mjs';
import { loadTokens, saveTokens, refreshTokens } from './_oauth.mjs';

const CLIENT_ID = process.env.CTRADER_CLIENT_ID;
const CLIENT_SECRET = process.env.CTRADER_CLIENT_SECRET;
// --snapshot flag works cross-platform (Windows cmd can't do `MODE=snapshot npm start`).
const MODE = process.argv.includes('--snapshot') ? 'snapshot' : (process.env.MODE || 'stream').toLowerCase();
const POLL_MS = Math.max(1000, Number(process.env.POLL_MS || 5000));
const HISTORY_MS = Math.max(30_000, Number(process.env.HISTORY_MS || 60_000)); // ~1 point/min
const HOSTS = { live: 'live.ctraderapi.com', demo: 'demo.ctraderapi.com' };

const log = {
  info: (...a) => console.log(new Date().toISOString(), ...a),
  warn: (...a) => console.warn(new Date().toISOString(), 'WARN', ...a),
  error: (...a) => console.error(new Date().toISOString(), 'ERROR', ...a),
};

// ---- helpers ---------------------------------------------------------------
/** Protobufjs returns int64 as Long objects — coerce anything to a JS number. */
function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}
const scale = (v, digits) => toNum(v) / Math.pow(10, toNum(digits) || 0);
const round = (v, d) => (Number.isFinite(v) ? Number(v.toFixed(Math.min(Math.max(d || 5, 0), 10))) : v);

/**
 * Map raw reconcile positions to the open_positions payload the dashboard expects.
 * Pure (no socket/DB) so it can be unit-tested. Field names/casing match what the
 * old cBot emitted, which App.jsx reads verbatim:
 *   side must be 'Buy'/'Sell' (UI color-checks === 'Buy'); sl/tp are 0 when unset
 *   (UI treats <=0 as none); lots = protocolVolume / lotSize (both in cents).
 */
export function buildPositions({ openRaw, floatByPos, details, syms }) {
  return openRaw.map((p) => {
    const td = p.tradeData || {};
    const pid = String(toNum(p.positionId));
    const symId = toNum(td.symbolId);
    const info = (details?.get?.(symId)) || {};
    const volCents = toNum(td.volume);                       // protocol volume (cents of units)
    const lots = info.lotSize ? volCents / info.lotSize : volCents / 100 / 100000; // cents cancel
    const digits = info.digits || 5;
    return {
      positionId: toNum(p.positionId),
      symbol: (syms?.get?.(symId)) || String(symId),
      side: toNum(td.tradeSide) === 2 ? 'Sell' : 'Buy',      // UI color-checks exactly 'Buy'
      lots: round(lots, 2),
      volume: volCents / 100,                                // units, for reference
      entry: round(toNum(p.price), digits),
      sl: round(toNum(p.stopLoss), digits),                  // 0 when unset -> UI shows —
      tp: round(toNum(p.takeProfit), digits),
      swap: scale(p.swap, p.moneyDigits),
      floatPnl: (floatByPos?.get?.(pid)) ?? 0,
    };
  });
}

/** Parse CTRADER_ACCOUNTS="name:ctid,name2:ctid2" into a ctid->name map. */
function parseAccountMap() {
  const raw = (process.env.CTRADER_ACCOUNTS || '').trim();
  const map = new Map();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const i = pair.lastIndexOf(':');
    if (i === -1) continue;
    const name = pair.slice(0, i).trim();
    const ctid = pair.slice(i + 1).trim();
    if (name && ctid) map.set(String(ctid), name);
  }
  return map;
}

// ---- token lifecycle -------------------------------------------------------
let TOKENS = null;
async function ensureFreshToken() {
  if (!TOKENS) {
    TOKENS = await loadTokens();
    if (!TOKENS?.refreshToken) {
      throw new Error('No tokens found. Run `npm run auth` once to authorize (scope=accounts).');
    }
  }
  const ageMs = Date.now() - (TOKENS.obtainedAt || 0);
  const lifeMs = (TOKENS.expiresIn || 0) * 1000;
  // Refresh if unknown expiry, or within 5 min of expiring.
  if (!lifeMs || ageMs > lifeMs - 5 * 60_000) {
    log.info('[token] refreshing access token');
    const next = await refreshTokens({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, refreshToken: TOKENS.refreshToken });
    TOKENS = next;
    await saveTokens(TOKENS).catch((e) => log.warn('could not persist tokens:', e.message));
  }
  return TOKENS.accessToken;
}

// ---- connection management (one client per host) ---------------------------
const clients = new Map();  // host -> { client, appAuthed, symbolsByAccount:Map }
async function getClient(host) {
  let entry = clients.get(host);
  if (entry?.client?._connected) return entry;
  const client = new CTraderClient({
    host,
    onEvent: (ev) => {
      if (ev.type === 'close') { clients.delete(host); return; }
      if (ev.name === 'ProtoOAAccountsTokenInvalidatedEvent') {
        log.warn('[token] invalidated by server — will refresh on next cycle');
        TOKENS = null; // force reload+refresh
      }
    },
    log,
  });
  await client.connect();
  await client.send('ProtoOAApplicationAuthReq', { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });
  entry = { client, symbolsByAccount: new Map(), authedAccounts: new Set() };
  clients.set(host, entry);
  return entry;
}

async function accountAuth(entry, ctid, accessToken) {
  if (entry.authedAccounts.has(String(ctid))) return;
  await entry.client.send('ProtoOAAccountAuthReq', { ctidTraderAccountId: ctid, accessToken });
  entry.authedAccounts.add(String(ctid));
}

// Light symbol list -> id->name for every symbol (one cheap call, cached).
async function symbolMap(entry, ctid) {
  const key = String(ctid);
  if (entry.symbolsByAccount.has(key)) return entry.symbolsByAccount.get(key);
  const res = await entry.client.send('ProtoOASymbolsListReq', { ctidTraderAccountId: ctid, includeArchivedSymbols: false });
  const m = new Map();
  for (const s of res.message?.symbol || []) m.set(toNum(s.symbolId), s.symbolName || String(toNum(s.symbolId)));
  entry.symbolsByAccount.set(key, m);
  return m;
}

// Full symbol details (price digits + lotSize) — only for the symbols in open
// positions, fetched once and cached. lotSize is needed to show volume in lots;
// digits to round entry/SL/TP for display. Both come from ProtoOASymbolByIdReq.
async function symbolDetails(entry, ctid, ids) {
  const key = String(ctid);
  if (!entry.symbolDetailsByAccount) entry.symbolDetailsByAccount = new Map();
  let cache = entry.symbolDetailsByAccount.get(key);
  if (!cache) { cache = new Map(); entry.symbolDetailsByAccount.set(key, cache); }
  const missing = [...new Set(ids)].filter((id) => id && !cache.has(id));
  if (missing.length) {
    const res = await entry.client.send('ProtoOASymbolByIdReq', { ctidTraderAccountId: ctid, symbolId: missing });
    for (const s of res.message?.symbol || []) {
      cache.set(toNum(s.symbolId), { digits: toNum(s.digits), lotSize: toNum(s.lotSize) });
    }
  }
  return cache;
}

// ---- discover which accounts to feed --------------------------------------
async function discoverAccounts(accessToken) {
  // Fetch the token's account list from the demo host (the list is identical on
  // either endpoint); each entry's isLive flag tells us which host to auth it on.
  const entry = await getClient(HOSTS.demo);
  const res = await entry.client.send('ProtoOAGetAccountListByAccessTokenReq', { accessToken });
  const accounts = res.message?.ctidTraderAccount || [];
  const nameMap = parseAccountMap();
  const out = accounts.map((a) => {
    const ctid = toNum(a.ctidTraderAccountId);
    const isLive = Boolean(a.isLive);
    const login = toNum(a.traderLogin);
    const name = nameMap.get(String(ctid)) || nameMap.get(String(login)) || String(login || ctid);
    return { ctid, isLive, login, name, host: isLive ? HOSTS.live : HOSTS.demo, broker: a.brokerTitleShort || '' };
  });
  if (!nameMap.size) {
    log.warn(`CTRADER_ACCOUNTS is empty — naming accounts by traderLogin: ${out.map((a) => a.name).join(', ')}. ` +
      'Set CTRADER_ACCOUNTS="dashboardName:ctidTraderAccountId,..." so account_live rows match the dashboard.');
  }
  return out;
}

// ---- one snapshot for one account -----------------------------------------
async function snapshotAccount(acct, accessToken) {
  const entry = await getClient(acct.host);
  await accountAuth(entry, acct.ctid, accessToken);
  const syms = await symbolMap(entry, acct.ctid).catch(() => new Map());

  const [traderRes, pnlRes, reconRes] = await Promise.all([
    entry.client.send('ProtoOATraderReq', { ctidTraderAccountId: acct.ctid }),
    entry.client.send('ProtoOAGetPositionUnrealizedPnLReq', { ctidTraderAccountId: acct.ctid }),
    entry.client.send('ProtoOAReconcileReq', { ctidTraderAccountId: acct.ctid }),
  ]);

  const trader = traderRes.message.trader;
  const balance = scale(trader.balance, trader.moneyDigits);

  const pnlDigits = pnlRes.message.moneyDigits;
  let floating = 0;
  const floatByPos = new Map();
  for (const p of pnlRes.message.positionUnrealizedPnL || []) {
    const net = scale(p.netUnrealizedPnL, pnlDigits);
    floating += net;
    floatByPos.set(String(toNum(p.positionId)), net);
  }

  const openRaw = (reconRes.message.position || []).filter((p) => toNum(p.positionStatus) === 1 /* OPEN */);
  const details = await symbolDetails(entry, acct.ctid, openRaw.map((p) => toNum(p.tradeData?.symbolId))).catch(() => new Map());
  const positions = buildPositions({ openRaw, floatByPos, details, syms });

  const equity = balance + floating;
  const marginUsed = positions.length
    ? (reconRes.message.position || []).reduce((s, p) => s + scale(p.usedMargin, p.moneyDigits), 0)
    : 0;

  await upsertLive(acct, { balance, equity, floating, positions, marginUsed });
  log.info(`[snap] ${acct.name} eq=${equity.toFixed(2)} bal=${balance.toFixed(2)} float=${floating.toFixed(2)} pos=${positions.length}`);
  return { equity, floating, balance };
}

// ---- persistence (carries intraday extremes across polls) ------------------
async function upsertLive(acct, { balance, equity, floating, positions, marginUsed }) {
  const db = supa();
  const today = serverDay();

  const { data: existing } = await db
    .from('account_live')
    .select('server_day, day_equity_high, day_equity_low, start_of_day_equity, start_of_day_balance, last_history_ts')
    .eq('account', acct.name)
    .maybeSingle();

  let dayHigh, dayLow, sodEquity, sodBalance;
  if (!existing || existing.server_day !== today) {
    dayHigh = equity; dayLow = equity; sodEquity = equity; sodBalance = balance;
  } else {
    dayHigh = Math.max(Number(existing.day_equity_high ?? equity), equity);
    dayLow = Math.min(Number(existing.day_equity_low ?? equity), equity);
    sodEquity = existing.start_of_day_equity ?? equity;
    sodBalance = existing.start_of_day_balance ?? balance;
  }

  const row = {
    account: acct.name,
    ctid_trader_account_id: acct.ctid,
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
  const { error } = await db.from('account_live').upsert(row, { onConflict: 'account' });
  if (error) throw new Error(`account_live upsert: ${error.message}`);

  // Throttled time-series point for the equity chart. Any failure (e.g. the
  // history migration not run yet) is swallowed so it can't break the snapshot.
  try {
    const nowMs = Date.now();
    const lastMs = existing?.last_history_ts ? new Date(existing.last_history_ts).getTime() : 0;
    if (!lastMs || nowMs - lastMs >= HISTORY_MS) {
      const nowIso = new Date().toISOString();
      const { error: hErr } = await db.from('account_live_history')
        .insert({ account: acct.name, ts: nowIso, balance, equity, floating_pnl: floating });
      if (!hErr) await db.from('account_live').update({ last_history_ts: nowIso }).eq('account', acct.name);
    }
  } catch {}
}

// ---- run one full cycle over all accounts ---------------------------------
async function cycle() {
  const accessToken = await ensureFreshToken();
  const accounts = await discoverAccounts(accessToken);
  if (!accounts.length) { log.warn('no accounts under this token'); return; }
  for (const acct of accounts) {
    try {
      await snapshotAccount(acct, accessToken);
    } catch (e) {
      log.error(`snapshot ${acct.name} failed:`, e.message);
    }
  }
}

function closeAll() {
  for (const [, e] of clients) e.client.close();
  clients.clear();
}

// ---- main ------------------------------------------------------------------
async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Set CTRADER_CLIENT_ID and CTRADER_CLIENT_SECRET.');
  log.info(`[ctrader-bridge] mode=${MODE} poll=${POLL_MS}ms`);

  if (MODE === 'snapshot') {
    await cycle();
    closeAll();
    log.info('[ctrader-bridge] snapshot complete');
    process.exit(0);
  }

  // stream mode: loop forever, rebuilding connections on failure.
  let stop = false;
  const shutdown = () => { stop = true; closeAll(); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!stop) {
    const started = Date.now();
    try {
      await cycle();
    } catch (e) {
      log.error('cycle failed, dropping connections:', e.message);
      closeAll();
    }
    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(0, POLL_MS - elapsed)));
  }
}

// Only auto-run when executed directly (so tests can import buildPositions etc.).
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';
if (fileURLToPath(import.meta.url) === argv[1]) {
  main().catch((e) => { log.error(e.stack || e.message); process.exit(1); });
}
