// _dealsync.mjs
// ──────────────────────────────────────────────────────────────────
// Drives ProtoOADealListReq paging and writes closed positions into `trades`.
//
// Separation of concerns, deliberately:
//   _deals.mjs     pure mapping, no I/O            (unit-tested exhaustively)
//   _dealsync.mjs  paging + watermark + upsert     (this file, I/O injected)
//   bridge.mjs     orchestration and scheduling
//
// Every dependency arrives as an argument, so the paging logic — the part with
// the off-by-one risks — is testable against a fake `send` with no socket and
// no database.
//
// ── Paging contract ─────────────────────────────────────────────────
// ProtoOADealListReq takes {ctidTraderAccountId, fromTimestamp, toTimestamp,
// maxRows} and the response carries {deal[], hasMore}. The server caps the span
// of a single request, so we walk the range in windows of at most one week and
// page within each window until hasMore clears.
//
// Historical endpoints are rate-limited harder than live ones (the published
// figure is 5 requests/second against 50 for non-historical), so requests are
// throttled. Being slow here costs nothing: this runs on a timer, not a
// user-facing path.
//
// ── Why the watermark is conservative ───────────────────────────────
// The watermark rewinds by WATERMARK_LAG_MS before each run. A deal can be
// written to the broker's history a moment after its execution timestamp, so
// resuming from exactly the last-seen timestamp can step over a trade that
// landed just behind the cursor. Re-reading a small overlap is free — the
// (account, dedup_key) upsert with ignoreDuplicates discards what we already
// have — whereas a skipped trade is invisible and permanent.
// ──────────────────────────────────────────────────────────────────

import { dealsToTrades, toNum, tradeDbRow } from './_deals.mjs';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const WATERMARK_LAG_MS = 60 * 60 * 1000;   // rewind 1h each run
export const DEFAULT_MAX_ROWS = 1000;
export const DEFAULT_THROTTLE_MS = 250;           // ~4 req/s, under the 5/s cap
export const MAX_PAGES_PER_WINDOW = 200;          // runaway guard

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Page every deal in [fromMs, toMs].
 *
 * @param {Function} send   (name, payload) => Promise<{message}>
 * @returns {Promise<Array>} raw decoded deals, may include opening deals
 */
export async function fetchDeals(send, ctid, fromMs, toMs, {
  maxRows = DEFAULT_MAX_ROWS,
  throttleMs = DEFAULT_THROTTLE_MS,
  log = null,
} = {}) {
  const all = [];
  if (!(toMs > fromMs)) return all;

  for (let windowStart = fromMs; windowStart < toMs; windowStart += WEEK_MS) {
    const windowEnd = Math.min(windowStart + WEEK_MS, toMs);
    let cursor = windowStart;
    let pages = 0;

    while (cursor < windowEnd) {
      if (++pages > MAX_PAGES_PER_WINDOW) {
        throw new Error(
          `deal paging exceeded ${MAX_PAGES_PER_WINDOW} pages in one week window ` +
          `(${new Date(windowStart).toISOString()}) — refusing to spin`
        );
      }

      const res = await send('ProtoOADealListReq', {
        ctidTraderAccountId: ctid,
        fromTimestamp: cursor,
        toTimestamp: windowEnd,
        maxRows,
      });

      const deals = res?.message?.deal || [];
      all.push(...deals);
      log?.info?.(
        `[deals] ${new Date(cursor).toISOString().slice(0, 10)} +${deals.length}` +
        (res?.message?.hasMore ? ' (more)' : '')
      );

      if (!res?.message?.hasMore || deals.length === 0) break;

      // Advance past the newest deal in this page. +1ms so the boundary deal is
      // not re-fetched forever; two deals sharing a millisecond would otherwise
      // pin the cursor and loop.
      const newest = deals.reduce(
        (m, d) => Math.max(m, toNum(d.executionTimestamp) || toNum(d.createTimestamp)),
        cursor
      );
      const next = newest + 1;
      if (next <= cursor) break;      // no forward progress — stop rather than spin
      cursor = next;

      if (throttleMs) await sleep(throttleMs);
    }

    if (throttleMs) await sleep(throttleMs);
  }

  return all;
}

/**
 * Decide the window to fetch for an account.
 *
 * First run for an account has no watermark, so it backfills from
 * `historyFromMs` (CTRADER_HISTORY_FROM, or the account's registration date).
 * Subsequent runs resume from the watermark minus the safety lag.
 */
export function resolveWindow({ lastDealTs, historyFromMs, nowMs }) {
  const from = lastDealTs
    ? Math.max(0, toNum(lastDealTs) - WATERMARK_LAG_MS)
    : toNum(historyFromMs);
  return { fromMs: from, toMs: nowMs, isBackfill: !lastDealTs };
}

/**
 * Sync one account's closed positions into `trades`.
 *
 * @param {Object}   db          Supabase client (service role)
 * @param {Function} send        bound client.send for this account's socket
 * @param {Object}   acct        {ctid, name}
 * @param {Object}   ctx         {symbols, lotSizes, serverOffsetMin, historyFromMs, nowMs, log}
 */
export async function syncAccountDeals(db, send, acct, ctx = {}) {
  const {
    symbols = new Map(),
    lotSizes = new Map(),
    serverOffsetMin = 180,
    historyFromMs = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000,
    nowMs = Date.now(),
    log = console,
    throttleMs = DEFAULT_THROTTLE_MS,
    // Optional async hook: (symbolIds) => Map<symbolId, lotSize>. Lets the
    // caller lazily fetch ProtoOASymbolByIdReq details for historical symbols.
    ensureLotSizes = null,
  } = ctx;

  const { data: live } = await db
    .from('account_live')
    .select('last_deal_ts')
    .eq('account', acct.name)
    .maybeSingle();

  const { fromMs, toMs, isBackfill } = resolveWindow({
    lastDealTs: live?.last_deal_ts,
    historyFromMs,
    nowMs,
  });

  if (isBackfill) {
    log.info?.(
      `[deals] ${acct.name}: first run, backfilling from ` +
      `${new Date(fromMs).toISOString().slice(0, 10)}`
    );
  }

  const rawDeals = await fetchDeals(send, acct.ctid, fromMs, toMs, { throttleMs, log });

  // Lots need each traded symbol's lotSize, and history reaches symbols that
  // are not in any open position — so the details cache is filled from what the
  // deals actually reference rather than from the open-positions list.
  let resolvedLotSizes = lotSizes;
  if (typeof ensureLotSizes === 'function' && rawDeals.length) {
    const ids = [...new Set(rawDeals.map((d) => toNum(d.symbolId)).filter(Boolean))];
    resolvedLotSizes = (await ensureLotSizes(ids)) || lotSizes;
  }

  const trades = dealsToTrades(rawDeals, {
    symbols, lotSizes: resolvedLotSizes, serverOffsetMin,
  });

  if (!trades.length) {
    // Still advance the watermark: an empty window is a fetched window, and not
    // recording that means re-scanning the same span forever.
    await db.from('account_live').update({ last_deal_ts: toMs }).eq('account', acct.name);
    return { fetched: rawDeals.length, mapped: 0, written: 0, lastDealTs: toMs, warnings: [] };
  }

  const warnings = [];
  const unknown = trades.filter((t) => t._unknownSymbol).length;
  if (unknown) {
    warnings.push(
      `${unknown} trade(s) have an unresolved symbol id and were stored with the ` +
      `numeric id as the symbol — the symbol list call probably failed.`
    );
  }
  const noDigits = trades.filter((t) => t._missingMoneyDigits).length;
  if (noDigits) {
    warnings.push(
      `${noDigits} trade(s) had no closePositionDetail.moneyDigits; P&L assumed ` +
      `2 decimal places. Verify these against the statement before trusting them.`
    );
  }

  const rows = trades.map((t) => tradeDbRow(t, acct.name));

  // ignoreDuplicates is what makes this safe to re-run and what lets an
  // API-synced trade and a hand-imported statement row collapse onto one
  // record: both derive dedup_key as `tkt:<positionId>`.
  const { error } = await db
    .from('trades')
    .upsert(rows, { onConflict: 'account,dedup_key', ignoreDuplicates: true });

  if (error) {
    // Do NOT advance the watermark — the next run must retry this span.
    throw new Error(`trades upsert failed for ${acct.name}: ${error.message}`);
  }

  // Watermark on the newest deal actually seen, not on `now`: if the broker is
  // lagging, `now` would skip whatever it has not published yet.
  const newest = trades.reduce((m, t) => Math.max(m, t._closeMs), 0) || toMs;
  await db.from('account_live').update({ last_deal_ts: newest }).eq('account', acct.name);

  for (const w of warnings) log.warn?.(`[deals] ${acct.name}: ${w}`);
  log.info?.(
    `[deals] ${acct.name}: ${rawDeals.length} deals -> ${trades.length} closed ` +
    `positions upserted (watermark ${new Date(newest).toISOString()})`
  );

  return {
    fetched: rawDeals.length,
    mapped: trades.length,
    written: rows.length,
    lastDealTs: newest,
    warnings,
  };
}
