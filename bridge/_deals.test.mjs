// _deals.test.mjs — node --test bridge/_deals.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dealsToTrades,
  groupClosingDeals,
  money,
  serverDateTime,
  toNum,
  tradeDbRow,
} from './_deals.mjs';

// Protobufjs Long stand-in.
const Long = (n) => ({ toNumber: () => n });

/** Build a closing deal. moneyDigits deliberately settable on BOTH levels. */
function closingDeal({
  positionId, dealId = 1, symbolId = 1, tradeSide = 2,
  executionPrice = 1.1, closedVolume = 100000,
  grossProfit = 0, swap = 0, commission = 0, pnlConversionFee = 0,
  innerDigits = 2, outerDigits = 2,
  executionTimestamp = 1_700_000_000_000, createTimestamp = 1_699_000_000_000,
}) {
  return {
    dealId, positionId, symbolId, tradeSide,
    executionPrice, executionTimestamp, createTimestamp,
    moneyDigits: outerDigits,
    commission: -999_99,          // outer commission — must NOT leak into P&L
    closePositionDetail: {
      entryPrice: 1.0,
      grossProfit, swap, commission, pnlConversionFee,
      closedVolume, moneyDigits: innerDigits,
    },
  };
}

const SYMBOLS = new Map([[1, 'EUR/USD'], [2, 'XAUUSD']]);
const LOTSIZES = new Map([[1, 10_000_000], [2, 10_000_000]]);
const opts = { symbols: SYMBOLS, lotSizes: LOTSIZES, serverOffsetMin: 180 };

test('toNum coerces Long, string, null', () => {
  assert.equal(toNum(Long(42)), 42);
  assert.equal(toNum('7'), 7);
  assert.equal(toNum(null), 0);
  assert.equal(toNum(undefined), 0);
});

test('money scales by the digits given, defaulting to 2', () => {
  assert.equal(money(12345, 2), 123.45);
  assert.equal(money(12345, 0), 12345);
  assert.equal(money(12345, 5), 0.12345);
  assert.equal(money(12345, null), 123.45);
});

test('opening deals (no closePositionDetail) are ignored', () => {
  const deals = [
    { dealId: 1, positionId: 10, symbolId: 1, tradeSide: 1, executionPrice: 1.0 },
    closingDeal({ positionId: 10, grossProfit: 50_00 }),
  ];
  assert.equal(groupClosingDeals(deals).length, 1);
});

test('P&L uses the INNER moneyDigits, not the outer one', () => {
  // grossProfit 50_00 with innerDigits 2 is $50. If the outer digits (0) were
  // used by mistake it would read as $5,000 — a 100x error.
  const trades = dealsToTrades(
    [closingDeal({ positionId: 10, grossProfit: 50_00, innerDigits: 2, outerDigits: 0 })],
    opts
  );
  assert.equal(trades[0].pnl, 50);
});

test('outer deal.commission never leaks into the trade', () => {
  const trades = dealsToTrades([closingDeal({ positionId: 10, grossProfit: 100_00 })], opts);
  assert.equal(trades[0].pnl, 100);       // not 100 - 999.99
  assert.equal(trades[0].commission, 0);
});

test('net = gross + swap + commission - pnlConversionFee', () => {
  const [t] = dealsToTrades([closingDeal({
    positionId: 10,
    grossProfit: 500_00,      // +500.00
    swap: -12_50,             //  -12.50
    commission: -7_00,        //   -7.00
    pnlConversionFee: 1_00,   //   -1.00
  })], opts);
  assert.equal(t.pnl, 479.5);
  // Statement convention: commission column is a positive magnitude.
  assert.equal(t.commission, 7);
  assert.equal(t.swap, -12.5);
});

test('closing SELL means the position was Long, and vice versa', () => {
  const [long] = dealsToTrades([closingDeal({ positionId: 1, tradeSide: 2 })], opts);
  const [short] = dealsToTrades([closingDeal({ positionId: 2, tradeSide: 1 })], opts);
  assert.equal(long.side, 'Long');
  assert.equal(short.side, 'Short');
});

test('symbol separator stripped and upper-cased, matching the statement', () => {
  const [t] = dealsToTrades([closingDeal({ positionId: 1, symbolId: 1 })], opts);
  assert.equal(t.symbol, 'EURUSD');
});

test('unknown symbol falls back to the id and is flagged', () => {
  const [t] = dealsToTrades([closingDeal({ positionId: 1, symbolId: 99 })], opts);
  assert.equal(t.symbol, '99');
  assert.equal(t._unknownSymbol, true);
});

test('lots = closedVolume / lotSize (cents cancel)', () => {
  const [t] = dealsToTrades(
    [closingDeal({ positionId: 1, closedVolume: 12_000_000 })], opts
  );
  assert.equal(t.lots, 1.2);
});

test('partial closes collapse to ONE trade, the way the statement shows it', () => {
  const deals = [
    closingDeal({ positionId: 77, dealId: 1, closedVolume: 5_000_000,
                  executionPrice: 1.20, grossProfit: 100_00,
                  executionTimestamp: 1_700_000_000_000 }),
    closingDeal({ positionId: 77, dealId: 2, closedVolume: 5_000_000,
                  executionPrice: 1.30, grossProfit: 200_00,
                  executionTimestamp: 1_700_000_600_000 }),
  ];
  const trades = dealsToTrades(deals, opts);
  assert.equal(trades.length, 1);
  const t = trades[0];
  assert.equal(t.lots, 1);              // 10,000,000 / 10,000,000
  assert.equal(t.pnl, 300);             // summed
  assert.equal(t.exit, 1.25);           // volume-weighted, not last
  assert.equal(t.ticket, '77');
  // Close time is the LAST fill — that's the day the position actually closed.
  assert.equal(t.time, serverDateTime(1_700_000_600_000, 180).time);
});

test('volume-weighted exit respects uneven fills', () => {
  const deals = [
    closingDeal({ positionId: 5, dealId: 1, closedVolume: 9_000_000, executionPrice: 1.0 }),
    closingDeal({ positionId: 5, dealId: 2, closedVolume: 1_000_000, executionPrice: 2.0 }),
  ];
  const [t] = dealsToTrades(deals, opts);
  assert.equal(t.exit, 1.1);            // not 1.5
});

test('server day is GMT+3 wall time, matching the statement header', () => {
  // 2026-03-02T05:03:17Z -> 08:03 on the GMT+3 server clock.
  const ms = Date.UTC(2026, 2, 2, 5, 3, 17);
  assert.deepEqual(serverDateTime(ms, 180), { date: '2026-03-02', time: '08:03' });
  // A 23:30 UTC close belongs to the NEXT server day.
  const late = Date.UTC(2026, 2, 2, 23, 30, 0);
  assert.equal(serverDateTime(late, 180).date, '2026-03-03');
});

test('dedup key is tkt:<positionId>, matching tradeDedupKey in App.jsx', () => {
  const [t] = dealsToTrades([closingDeal({ positionId: 1023402 })], opts);
  assert.equal(t._dedupKey, 'tkt:1023402');
});

test('prices are doubles and must not be rescaled', () => {
  const [t] = dealsToTrades(
    [closingDeal({ positionId: 1, executionPrice: 5351.44 })], opts
  );
  assert.equal(t.exit, 5351.44);        // not 0.0535144
});

test('trades come back oldest-first so a watermark is safe to resume from', () => {
  const deals = [
    closingDeal({ positionId: 3, executionTimestamp: 3000 }),
    closingDeal({ positionId: 1, executionTimestamp: 1000 }),
    closingDeal({ positionId: 2, executionTimestamp: 2000 }),
  ];
  const ts = dealsToTrades(deals, opts).map((t) => t.ticket);
  assert.deepEqual(ts, ['1', '2', '3']);
});

test('missing inner moneyDigits is flagged rather than silently assumed', () => {
  const d = closingDeal({ positionId: 1, grossProfit: 100_00 });
  delete d.closePositionDetail.moneyDigits;
  const [t] = dealsToTrades([d], opts);
  assert.equal(t._missingMoneyDigits, true);
  assert.equal(t.pnl, 100);             // default of 2 still applied
});

test('Long-wrapped int64 fields decode correctly', () => {
  const d = closingDeal({ positionId: 1, grossProfit: 0 });
  d.positionId = Long(4242);
  d.closePositionDetail.grossProfit = Long(250_00);
  d.closePositionDetail.closedVolume = Long(10_000_000);
  const [t] = dealsToTrades([d], opts);
  assert.equal(t.ticket, '4242');
  assert.equal(t.pnl, 250);
  assert.equal(t.lots, 1);
});

test('zero-volume closes are dropped, not divided by', () => {
  const trades = dealsToTrades([closingDeal({ positionId: 1, closedVolume: 0 })], opts);
  assert.equal(trades.length, 0);
});

test('tradeDbRow matches rowOf() in App.jsx column for column', () => {
  const [t] = dealsToTrades([closingDeal({
    positionId: 55, grossProfit: 300_00, swap: -5_00, commission: -2_00,
  })], opts);
  const row = tradeDbRow(t, 'FundedHive 50k');

  assert.deepEqual(Object.keys(row).sort(), [
    'account', 'candle_type', 'chart_image', 'chart_link', 'commission', 'date',
    'dedup_key', 'entry', 'exit_price', 'liquidity_taken', 'liquidity_target',
    'lots', 'market_structure', 'notes', 'pnl', 'side', 'swap', 'symbol',
    'ticket', 'time',
  ]);
  assert.equal(row.account, 'FundedHive 50k');
  assert.equal(row.dedup_key, 'tkt:55');
  assert.equal(row.ticket, '55');
  assert.equal(row.exit_price, t.exit);
  assert.equal(row.pnl, 293);
  // Internal bookkeeping must never reach the database.
  assert.equal(row._closeMs, undefined);
  assert.equal(row._dedupKey, undefined);
});

test('empty and malformed input degrade quietly', () => {
  assert.deepEqual(dealsToTrades([], opts), []);
  assert.deepEqual(dealsToTrades(null, opts), []);
  assert.deepEqual(dealsToTrades([{}, { closePositionDetail: null }], opts), []);
});
