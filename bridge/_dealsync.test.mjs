// _dealsync.test.mjs — node --test bridge/_dealsync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_PAGES_PER_WINDOW,
  WATERMARK_LAG_MS,
  WEEK_MS,
  fetchDeals,
  resolveWindow,
  syncAccountDeals,
} from './_dealsync.mjs';

const NOW = Date.UTC(2026, 7, 26, 12, 0, 0);
const SYMBOLS = new Map([[1, 'EURUSD']]);
const LOTSIZES = new Map([[1, 10_000_000]]);
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

function deal(positionId, execMs, gross = 100_00) {
  return {
    dealId: positionId, positionId, symbolId: 1, tradeSide: 2,
    executionPrice: 1.1, executionTimestamp: execMs, createTimestamp: execMs - 1000,
    moneyDigits: 2,
    closePositionDetail: {
      entryPrice: 1.0, grossProfit: gross, swap: 0, commission: 0,
      pnlConversionFee: 0, closedVolume: 10_000_000, moneyDigits: 2,
    },
  };
}

/** Records every request so window/cursor arithmetic can be asserted. */
function recorder(pages) {
  const calls = [];
  let i = 0;
  const send = async (name, payload) => {
    calls.push({ name, ...payload });
    const page = typeof pages === 'function' ? pages(payload, i) : (pages[i] ?? { deal: [], hasMore: false });
    i += 1;
    return { message: page };
  };
  return { send, calls };
}

// ── window resolution ──────────────────────────────────────────────
test('first run backfills from historyFrom', () => {
  const from = Date.UTC(2024, 0, 1);
  const w = resolveWindow({ lastDealTs: null, historyFromMs: from, nowMs: NOW });
  assert.equal(w.fromMs, from);
  assert.equal(w.toMs, NOW);
  assert.equal(w.isBackfill, true);
});

test('later runs resume from the watermark minus the safety lag', () => {
  const mark = Date.UTC(2026, 7, 20);
  const w = resolveWindow({ lastDealTs: mark, historyFromMs: 0, nowMs: NOW });
  assert.equal(w.fromMs, mark - WATERMARK_LAG_MS);
  assert.equal(w.isBackfill, false);
});

test('watermark rewind never goes negative', () => {
  assert.equal(resolveWindow({ lastDealTs: 5, historyFromMs: 0, nowMs: NOW }).fromMs, 0);
});

// ── paging ─────────────────────────────────────────────────────────
test('a sub-week range is one request', async () => {
  const { send, calls } = recorder([{ deal: [deal(1, NOW - 1000)], hasMore: false }]);
  const out = await fetchDeals(send, 42, NOW - 1000 * 60, NOW, { throttleMs: 0, log: quiet });
  assert.equal(calls.length, 1);
  assert.equal(out.length, 1);
  assert.equal(calls[0].ctidTraderAccountId, 42);
});

test('ranges are split into <= 1 week windows', async () => {
  const { send, calls } = recorder(() => ({ deal: [], hasMore: false }));
  const from = NOW - 3 * WEEK_MS - 1000;
  await fetchDeals(send, 1, from, NOW, { throttleMs: 0, log: quiet });
  assert.equal(calls.length, 4);                       // 3 whole weeks + remainder
  for (const c of calls) {
    assert.ok(c.toTimestamp - c.fromTimestamp <= WEEK_MS,
      `window ${c.toTimestamp - c.fromTimestamp}ms exceeds a week`);
  }
  assert.equal(calls[0].fromTimestamp, from);
  assert.equal(calls.at(-1).toTimestamp, NOW);
});

test('windows tile the range with no gap', async () => {
  const { send, calls } = recorder(() => ({ deal: [], hasMore: false }));
  const from = NOW - 2 * WEEK_MS;
  await fetchDeals(send, 1, from, NOW, { throttleMs: 0, log: quiet });
  for (let i = 1; i < calls.length; i++) {
    assert.equal(calls[i].fromTimestamp, calls[i - 1].toTimestamp,
      'a gap between windows would silently lose trades');
  }
});

test('hasMore pages forward within a window, past the newest deal', async () => {
  const t0 = NOW - 1000 * 60 * 60;
  const { send, calls } = recorder([
    { deal: [deal(1, t0), deal(2, t0 + 5000)], hasMore: true },
    { deal: [deal(3, t0 + 9000)], hasMore: false },
  ]);
  const out = await fetchDeals(send, 1, t0 - 1000, NOW, { throttleMs: 0, log: quiet });
  assert.equal(out.length, 3);
  assert.equal(calls[1].fromTimestamp, t0 + 5001, 'must resume just past the newest deal');
});

test('hasMore with an empty page stops instead of looping', async () => {
  const { send, calls } = recorder(() => ({ deal: [], hasMore: true }));
  await fetchDeals(send, 1, NOW - 1000, NOW, { throttleMs: 0, log: quiet });
  assert.equal(calls.length, 1);
});

test('a server that never advances is capped, not spun forever', async () => {
  // Always returns the same deal with hasMore — the pathological case.
  const stuck = NOW - 1000 * 60;
  const { send } = recorder(() => ({ deal: [deal(1, stuck)], hasMore: true }));
  await assert.rejects(
    () => fetchDeals(send, 1, stuck - 1, NOW, { throttleMs: 0, log: quiet }),
    /exceeded \d+ pages/
  );
});

test('inverted or empty ranges do nothing', async () => {
  const { send, calls } = recorder(() => ({ deal: [], hasMore: false }));
  assert.deepEqual(await fetchDeals(send, 1, NOW, NOW, { throttleMs: 0 }), []);
  assert.deepEqual(await fetchDeals(send, 1, NOW + 1000, NOW, { throttleMs: 0 }), []);
  assert.equal(calls.length, 0);
});

// ── the DB-facing sync ─────────────────────────────────────────────
function fakeDb({ lastDealTs = null, upsertError = null } = {}) {
  const state = { upserts: [], updates: [], lastDealTs };
  const db = {
    from(table) {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { last_deal_ts: state.lastDealTs } }) }),
        }),
        upsert: async (rows, opts) => {
          state.upserts.push({ table, rows, opts });
          return { error: upsertError };
        },
        update: (patch) => ({
          eq: async (_col, val) => { state.updates.push({ table, patch, account: val }); return {}; },
        }),
      };
    },
  };
  return { db, state };
}

const ctx = (over = {}) => ({
  symbols: SYMBOLS, lotSizes: LOTSIZES, serverOffsetMin: 180,
  historyFromMs: NOW - WEEK_MS, nowMs: NOW, log: quiet, throttleMs: 0, ...over,
});

test('closed positions are upserted on (account, dedup_key) with duplicates ignored', async () => {
  const { db, state } = fakeDb();
  const { send } = recorder([{ deal: [deal(101, NOW - 5000)], hasMore: false }]);
  const r = await syncAccountDeals(db, send, { ctid: 7, name: 'FH 50k' }, ctx());

  assert.equal(r.mapped, 1);
  assert.equal(state.upserts.length, 1);
  const { rows, opts, table } = state.upserts[0];
  assert.equal(table, 'trades');
  assert.equal(opts.onConflict, 'account,dedup_key');
  assert.equal(opts.ignoreDuplicates, true);
  assert.equal(rows[0].account, 'FH 50k');
  assert.equal(rows[0].dedup_key, 'tkt:101');
  assert.equal(rows[0].pnl, 100);
});

test('watermark advances to the newest DEAL, not to now', async () => {
  const { db, state } = fakeDb();
  const newest = NOW - 3 * 60 * 60 * 1000;      // broker lagging 3h
  const { send } = recorder([{ deal: [deal(1, newest - 1000), deal(2, newest)], hasMore: false }]);
  await syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx());
  const mark = state.updates.at(-1);
  assert.equal(mark.patch.last_deal_ts, newest,
    'using now() here would skip deals the broker has not published yet');
});

test('an empty window still advances the watermark', async () => {
  const { db, state } = fakeDb();
  const { send } = recorder([{ deal: [], hasMore: false }]);
  const r = await syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx());
  assert.equal(r.written, 0);
  assert.equal(state.updates.at(-1).patch.last_deal_ts, NOW);
});

test('a failed upsert throws and leaves the watermark alone', async () => {
  const { db, state } = fakeDb({ upsertError: { message: 'permission denied' } });
  const { send } = recorder([{ deal: [deal(1, NOW - 1000)], hasMore: false }]);
  await assert.rejects(
    () => syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx()),
    /trades upsert failed for A: permission denied/
  );
  assert.equal(state.updates.length, 0, 'watermark must not move when the write failed');
});

test('re-running over the same span writes the same dedup keys (idempotent)', async () => {
  const d = deal(999, NOW - 5000);
  const first = fakeDb();
  const second = fakeDb({ lastDealTs: NOW - 5000 });
  const a = recorder([{ deal: [d], hasMore: false }]);
  const b = recorder([{ deal: [d], hasMore: false }]);

  await syncAccountDeals(first.db, a.send, { ctid: 7, name: 'A' }, ctx());
  await syncAccountDeals(second.db, b.send, { ctid: 7, name: 'A' }, ctx());

  assert.equal(first.state.upserts[0].rows[0].dedup_key,
               second.state.upserts[0].rows[0].dedup_key);
});

test('the safety lag makes the second run re-read a small overlap', async () => {
  const mark = NOW - 30 * 60 * 1000;
  const { db } = fakeDb({ lastDealTs: mark });
  const { send, calls } = recorder(() => ({ deal: [], hasMore: false }));
  await syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx());
  assert.equal(calls[0].fromTimestamp, mark - WATERMARK_LAG_MS);
});

test('unresolved symbols and missing moneyDigits surface as warnings', async () => {
  const d = deal(1, NOW - 1000);
  d.symbolId = 4242;                                 // not in the symbol map
  delete d.closePositionDetail.moneyDigits;
  const { db } = fakeDb();
  const { send } = recorder([{ deal: [d], hasMore: false }]);
  const r = await syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx());
  assert.equal(r.warnings.length, 2);
  assert.ok(r.warnings.some((w) => /unresolved symbol/.test(w)));
  assert.ok(r.warnings.some((w) => /moneyDigits/.test(w)));
});

test('internal bookkeeping never reaches the database', async () => {
  const { db, state } = fakeDb();
  const { send } = recorder([{ deal: [deal(1, NOW - 1000)], hasMore: false }]);
  await syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx());
  for (const k of Object.keys(state.upserts[0].rows[0])) {
    assert.ok(!k.startsWith('_'), `internal field ${k} leaked into the row`);
  }
});

test('ensureLotSizes is called with the symbols history actually references', async () => {
  const { db, state } = fakeDb();
  const d1 = deal(1, NOW - 3000); d1.symbolId = 11;
  const d2 = deal(2, NOW - 2000); d2.symbolId = 22;
  const d3 = deal(3, NOW - 1000); d3.symbolId = 11;      // duplicate id
  const { send } = recorder([{ deal: [d1, d2, d3], hasMore: false }]);

  let asked = null;
  await syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx({
    lotSizes: new Map(),
    symbols: new Map([[11, 'GBPJPY'], [22, 'XAGUSD']]),
    ensureLotSizes: async (ids) => {
      asked = ids;
      return new Map([[11, 10_000_000], [22, 500_000]]);
    },
  }));

  assert.deepEqual(asked.sort(), [11, 22], 'should ask once per distinct symbol');
  const rows = state.upserts[0].rows;
  assert.equal(rows.find((r) => r.symbol === 'XAGUSD').lots, 20);   // 10m / 500k
  assert.equal(rows.find((r) => r.symbol === 'GBPJPY').lots, 1);
});

test('without ensureLotSizes the static map is used unchanged', async () => {
  const { db, state } = fakeDb();
  const { send } = recorder([{ deal: [deal(1, NOW - 1000)], hasMore: false }]);
  await syncAccountDeals(db, send, { ctid: 7, name: 'A' }, ctx());
  assert.equal(state.upserts[0].rows[0].lots, 1);
});
