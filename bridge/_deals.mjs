// _deals.mjs
// ──────────────────────────────────────────────────────────────────
// Turn cTrader Open API deals into rows for the app's existing `trades`
// table — byte-compatible with parseCTraderStatement() in src/App.jsx, so an
// API-synced trade and the same trade imported from an HTML statement collapse
// onto one row via the (account, dedup_key) upsert instead of doubling up.
//
// Pure: no socket, no DB, no clock. Everything comes in as arguments so the
// mapping can be unit-tested without a broker connection.
//
// ── Why closed positions have to be rebuilt from deals ──────────────
// There is no "closed trades" message in the Open API. `ProtoOAGetClosedTradesReq`
// does not exist; the history messages are ProtoOADealListReq, OrderListReq,
// DealOffsetListReq and CashFlowHistoryListReq. A closed position is derived:
// every deal carrying a `closePositionDetail` closed some volume, and one
// position may be closed by SEVERAL deals (partial closes). The statement shows
// one row per position, so we aggregate deals by positionId to match.
//
// ── The scaling trap ────────────────────────────────────────────────
// ProtoOADeal.moneyDigits and ProtoOADeal.closePositionDetail.moneyDigits are
// two DIFFERENT fields, and the P&L components live under the inner one:
//
//   deal.moneyDigits                  scales  deal.commission
//   deal.closePositionDetail.moneyDigits      grossProfit, swap, commission,
//                                             balance, pnlConversionFee
//
// Using the outer digits on the inner numbers silently scales P&L by a factor
// of 10^n. Both fields are `optional` in the .proto with no declared default,
// so absence is handled explicitly rather than assumed to be 2.
//
// Prices (executionPrice, entryPrice) are already `double` in the protocol —
// they are NOT scaled integers. Dividing them by 10^digits produces garbage.
// Volumes are in cents, and so is ProtoOASymbol.lotSize, so the factor cancels
// in `lots = closedVolume / lotSize`.
// ──────────────────────────────────────────────────────────────────

/** Protobufjs returns int64 as Long objects — coerce anything to a JS number. */
export function toNum(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Number(v) || 0;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}

/**
 * Scale a money integer. `digits` must be the moneyDigits field that governs
 * THIS value — see the header note. Missing digits is treated as 2 (the value
 * every cTrader account we have seen uses) and flagged by the caller rather
 * than guessed silently elsewhere.
 */
export function money(v, digits) {
  const d = digits == null ? 2 : toNum(digits);
  return toNum(v) / Math.pow(10, d);
}

const TRADE_SIDE_BUY = 1;
const TRADE_SIDE_SELL = 2;

/** Round to `n` decimals without the float dust `toFixed` alone leaves behind. */
function round(v, n) {
  if (!Number.isFinite(v)) return 0;
  const f = Math.pow(10, n);
  return Math.round(v * f) / f;
}

/**
 * Format a UTC epoch-ms as the broker's server-day date/time.
 *
 * Prop firms evaluate the trading day on their own server clock (GMT+3 for the
 * cTrader servers this dashboard talks to), and the daily-drawdown reset lands
 * on that boundary. Storing UTC would shift trades across day boundaries and
 * quietly misalign the daily breakdown, so we store server-local wall time —
 * which is also exactly what the HTML statement prints.
 */
export function serverDateTime(epochMs, offsetMin) {
  const shifted = new Date(toNum(epochMs) + toNum(offsetMin) * 60000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/**
 * Group closing deals into one record per position.
 *
 * A position closed in three partial fills produces three deals. The statement
 * shows one row: total closed volume, volume-weighted prices, summed P&L, and
 * the LAST close time. We reproduce that.
 */
export function groupClosingDeals(deals) {
  const byPosition = new Map();

  for (const deal of deals || []) {
    const cpd = deal?.closePositionDetail;
    if (!cpd) continue;                       // opening deal — no position closed
    const closedVolume = toNum(cpd.closedVolume);
    if (closedVolume <= 0) continue;

    const positionId = String(toNum(deal.positionId));
    let g = byPosition.get(positionId);
    if (!g) {
      g = {
        positionId,
        symbolId: toNum(deal.symbolId),
        // The CLOSING deal's side is the opposite of the position's direction:
        // you sell to close a long. The statement's "Opening direction" column
        // is the position's own side, so invert.
        openingSide: toNum(deal.tradeSide) === TRADE_SIDE_SELL ? 'Long' : 'Short',
        closedVolume: 0,
        entryNumerator: 0,
        exitNumerator: 0,
        grossProfit: 0,
        swap: 0,
        commission: 0,
        pnlConversionFee: 0,
        lastCloseMs: 0,
        firstOpenMs: Number.POSITIVE_INFINITY,
        dealIds: [],
        missingMoneyDigits: false,
      };
      byPosition.set(positionId, g);
    }

    const d = cpd.moneyDigits;
    if (d == null) g.missingMoneyDigits = true;

    g.closedVolume += closedVolume;
    g.entryNumerator += toNum(cpd.entryPrice) * closedVolume;
    g.exitNumerator += toNum(deal.executionPrice) * closedVolume;

    // Every one of these is scaled by the INNER moneyDigits, not deal.moneyDigits.
    g.grossProfit += money(cpd.grossProfit, d);
    g.swap += money(cpd.swap, d);
    g.commission += money(cpd.commission, d);
    g.pnlConversionFee += money(cpd.pnlConversionFee, d);

    const execMs = toNum(deal.executionTimestamp) || toNum(deal.createTimestamp);
    if (execMs > g.lastCloseMs) g.lastCloseMs = execMs;
    const openMs = toNum(deal.createTimestamp);
    if (openMs && openMs < g.firstOpenMs) g.firstOpenMs = openMs;

    g.dealIds.push(toNum(deal.dealId));
  }

  return [...byPosition.values()];
}

/**
 * Map grouped positions to the trade shape parseCTraderStatement() produces.
 *
 * @param {Array}  deals            decoded ProtoOADeal messages
 * @param {Object} opts
 * @param {Map}    opts.symbols     symbolId -> broker symbol name
 * @param {Map}    opts.lotSizes    symbolId -> lotSize (cents), for lots
 * @param {number} opts.serverOffsetMin  broker server offset from UTC, minutes
 * @param {string} opts.notes       provenance string written to every row
 */
export function dealsToTrades(deals, {
  symbols = new Map(),
  lotSizes = new Map(),
  serverOffsetMin = 180,
  notes = 'Synced from cTrader API',
} = {}) {
  const groups = groupClosingDeals(deals);
  const trades = [];

  for (const g of groups) {
    const { date, time } = serverDateTime(g.lastCloseMs, serverOffsetMin);
    const lotSize = toNum(lotSizes.get?.(g.symbolId));
    const lots = lotSize > 0 ? g.closedVolume / lotSize : 0;

    // Statement "Net" = gross + swap + commission - pnlConversionFee.
    // commission and pnlConversionFee arrive as costs (negative / positive
    // respectively per the protocol), so this addition is the firm's own
    // arithmetic, not ours.
    const pnl = g.grossProfit + g.swap + g.commission - g.pnlConversionFee;

    const rawSymbol = symbols.get?.(g.symbolId);
    trades.push({
      date,
      time,
      // Statement strips the separator and upper-cases: EUR/USD -> EURUSD.
      symbol: String(rawSymbol ?? g.symbolId).replace(/\//g, '').toUpperCase(),
      side: g.openingSide,
      entry: round(g.closedVolume ? g.entryNumerator / g.closedVolume : 0, 5),
      exit: round(g.closedVolume ? g.exitNumerator / g.closedVolume : 0, 5),
      lots: round(lots, 2),
      pnl: round(pnl, 2),
      // The statement stores commission as a positive magnitude (it does
      // Math.abs on the cell), while `pnl` above already has the cost netted
      // out. Keep both conventions identical or the two import paths disagree.
      commission: round(Math.abs(g.commission), 2),
      swap: round(g.swap, 2),
      ticket: g.positionId,
      marketStructure: '',
      candleType: '',
      liquidityTaken: [],
      liquidityTarget: [],
      notes,
      chartLink: '',
      chartImage: '',
      _dedupKey: `tkt:${g.positionId}`,
      _closeMs: g.lastCloseMs,
      _missingMoneyDigits: g.missingMoneyDigits,
      _unknownSymbol: rawSymbol == null,
    });
  }

  // Oldest first, so a crash mid-batch leaves a watermark that is safe to resume
  // from rather than one that skips the gap.
  trades.sort((a, b) => a._closeMs - b._closeMs);
  return trades;
}

/**
 * Project a trade onto a `trades` row. Column names and types mirror rowOf()
 * in src/App.jsx exactly — if that changes, this must change with it.
 */
export function tradeDbRow(trade, account) {
  return {
    date: trade.date,
    time: trade.time,
    symbol: trade.symbol,
    side: trade.side,
    entry: trade.entry,
    exit_price: trade.exit,
    lots: trade.lots,
    pnl: trade.pnl,
    commission: trade.commission,
    swap: trade.swap,
    market_structure: trade.marketStructure,
    candle_type: trade.candleType,
    liquidity_taken: trade.liquidityTaken,
    liquidity_target: trade.liquidityTarget,
    notes: trade.notes,
    account,
    chart_link: trade.chartLink,
    chart_image: trade.chartImage,
    ticket: trade.ticket || null,
    dedup_key: trade._dedupKey,
  };
}
