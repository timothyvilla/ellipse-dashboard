// OKX historical P&L sync — two tiers into Supabase.
//
//  TIER 1 (rolling ~3 months, rich):   syncPositionsHistory()  -> okx_positions_history
//  TIER 2 (full history since 2021):   backfillBillsSince2021() -> okx_bills  (quarterly archive files)
//  TIER 1b (incremental ledger):        syncRecentBills()        -> okx_bills  (last ~3mo, source='live')
//
// The dashboard reads Supabase, never OKX — so PnL persists across logout
// instead of living in session state that resets on login.

import AdmZip from 'adm-zip';
import { okxRequest, rateLimiter, sleep } from './_client.mjs';
import { upsert, supa } from './_supabase.mjs';

// Broker/server day standardization (GMT+3), matching MT5_SERVER_OFFSET_MIN in the cTrader design.
const SERVER_OFFSET_MIN = Number(process.env.MT5_SERVER_OFFSET_MIN ?? 180); // +3h
const ACCOUNT = process.env.OKX_ACCOUNT_LABEL || 'okx';

function serverDay(ms) {
  if (!ms) return null;
  const shifted = new Date(Number(ms) + SERVER_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10); // YYYY-MM-DD in GMT+offset
}
const iso = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);
const num = (v) => (v === '' || v == null ? null : Number(v));

// ---------------------------------------------------------------------------
// OKX bill taxonomy — THE fix for "funding rates counted as trades".
// A real trade is type '2' (Trade). Funding is type '8'. Everything else
// (transfers, interest, rebates, ADL, liquidation, settlement) is not a trade.
// Ref: OKX V5 "Get bills details" bill `type` codes.
// ---------------------------------------------------------------------------
export const BILL_TYPE = {
  '1': 'transfer',
  '2': 'trade',
  '3': 'delivery',
  '4': 'auto_margin',
  '5': 'liquidation',
  '6': 'margin_transfer',
  '7': 'interest_deduction',
  '8': 'funding_fee',
  '9': 'interest_deduction',
  '12': 'auto_conversion',
  '14': 'block_trade',
  '22': 'rebate',
};
export const isTrade = (type) => String(type) === '2';
export const isFunding = (type) => String(type) === '8';

// ===========================================================================
// TIER 1 — positions history (closed positions with fee-inclusive realizedPnl)
// GET /api/v5/account/positions-history   limit 100, 10 req / 2s, paginate by uTime via `after`
// ===========================================================================
export async function syncPositionsHistory({ instType } = {}) {
  const throttle = rateLimiter(10, 2000);
  const rows = [];
  let after; // cursor = uTime of last row
  for (let page = 0; page < 200; page++) {
    await throttle();
    const { data } = await okxRequest('GET', '/api/v5/account/positions-history', {
      params: { instType, limit: '100', after },
    });
    if (!data?.length) break;
    for (const p of data) {
      rows.push({
        pos_id: p.posId,
        account: ACCOUNT,
        inst_type: p.instType,
        inst_id: p.instId,
        mgn_mode: p.mgnMode,
        pos_side: p.posSide,
        lever: num(p.lever),
        open_avg_px: num(p.openAvgPx),
        close_avg_px: num(p.closeAvgPx),
        open_time: iso(p.cTime),
        close_time: iso(p.uTime),
        server_day: serverDay(p.uTime),
        realized_pnl: num(p.realizedPnl),
        pnl: num(p.pnl),
        fee: num(p.fee),
        funding_fee: num(p.fundingFee),
        liq_penalty: num(p.liqPenalty),
        pnl_ratio: num(p.pnlRatio),
        ccy: p.ccy,
        raw: p,
      });
    }
    after = data[data.length - 1].uTime;
    if (data.length < 100) break;
  }
  const n = await upsert('okx_positions_history', rows, 'pos_id');
  return { table: 'okx_positions_history', upserted: n };
}

// ===========================================================================
// TIER 1b — recent bills ledger (last ~3 months), incremental.
// GET /api/v5/account/bills-archive   limit 100, 5 req / 2s, paginate by billId via `after`
// Funding rows are KEPT (source of truth for funding cost) but tagged so the
// Recent Trades card can exclude them.
// ===========================================================================
export async function syncRecentBills({ instType } = {}) {
  const throttle = rateLimiter(5, 2000);
  const rows = [];
  let after;
  for (let page = 0; page < 200; page++) {
    await throttle();
    const { data } = await okxRequest('GET', '/api/v5/account/bills-archive', {
      params: { instType, limit: '100', after },
    });
    if (!data?.length) break;
    for (const b of data) rows.push(billRow(b, 'live'));
    after = data[data.length - 1].billId;
    if (data.length < 100) break;
  }
  const n = await upsert('okx_bills', rows, 'bill_id');
  return { table: 'okx_bills', source: 'live', upserted: n };
}

function billRow(b, source) {
  return {
    bill_id: b.billId,
    account: ACCOUNT,
    ts: iso(b.ts),
    server_day: serverDay(b.ts),
    inst_type: b.instType,
    inst_id: b.instId,
    ccy: b.ccy,
    type: b.type,
    sub_type: b.subType,
    pnl: num(b.pnl),
    bal_chg: num(b.balChg),
    fee: num(b.fee),
    bal: num(b.bal),
    ord_id: b.ordId || null,
    pos_id: b.posId || null,
    source,
    raw: b,
  };
}

// ===========================================================================
// TIER 2 — FULL history since 2021 via quarterly archive files.
//   POST /api/v5/account/bills-history-archive  { year, quarter }   -> apply (rate-limited, ~12/day)
//   GET  /api/v5/account/bills-history-archive?year=&quarter=       -> { state, fileHref, ts }
// state 'finished' => download the .zip (CSV inside), parse, upsert.
// Progress is recorded per (account, year, quarter) so this is resumable.
// ===========================================================================
export async function backfillBillsSince2021({ startYear = 2021, endYear } = {}) {
  const now = new Date();
  endYear = endYear || now.getUTCFullYear();
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const results = [];

  const targets = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const q of quarters) {
      // skip future quarters
      const qEndMonth = { Q1: 3, Q2: 6, Q3: 9, Q4: 12 }[q];
      if (new Date(Date.UTC(y, qEndMonth - 3, 1)) > now) continue;
      targets.push({ year: y, quarter: q });
    }
  }

  // Load prior progress so we don't re-request finished quarters.
  const { data: prog } = await supa()
    .from('okx_backfill_progress')
    .select('year,quarter,state')
    .eq('account', ACCOUNT);
  const done = new Set((prog || []).filter((p) => p.state === 'done' || p.state === 'empty').map((p) => `${p.year}${p.quarter}`));

  for (const t of targets) {
    if (done.has(`${t.year}${t.quarter}`)) {
      results.push({ ...t, skipped: true });
      continue;
    }
    try {
      const r = await backfillOneQuarter(t.year, t.quarter);
      results.push({ ...t, ...r });
    } catch (e) {
      await setProgress(t.year, t.quarter, 'error', { note: String(e.message || e) });
      results.push({ ...t, error: String(e.message || e) });
      // On apply rate-limit, stop early — resume tomorrow; already-done quarters are skipped.
      if (e.okxCode === '50011' || /rate limit|too many/i.test(String(e.message))) {
        results.push({ note: 'apply rate limit hit — rerun later to resume' });
        break;
      }
    }
  }
  return results;
}

async function backfillOneQuarter(year, quarter) {
  // 1) apply
  await okxRequest('POST', '/api/v5/account/bills-history-archive', {
    body: { year: String(year), quarter },
  });
  await setProgress(year, quarter, 'requested');

  // 2) poll for the file to be generated
  let fileHref = null;
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const { data } = await okxRequest('GET', '/api/v5/account/bills-history-archive', {
      params: { year: String(year), quarter },
    });
    const row = data?.[0];
    if (row?.state === 'finished' && row.fileHref) {
      fileHref = row.fileHref;
      break;
    }
  }
  if (!fileHref) throw new Error(`archive ${year} ${quarter} not ready after polling`);

  // 3) download + parse + upsert
  const bills = await downloadAndParseArchive(fileHref);
  if (!bills.length) {
    await setProgress(year, quarter, 'empty', { file_href: fileHref });
    return { upserted: 0, empty: true };
  }
  const rows = bills.map((b) => billRow(b, 'archive'));
  const n = await upsert('okx_bills', rows, 'bill_id');
  await setProgress(year, quarter, 'done', { file_href: fileHref, note: `${n} rows` });
  return { upserted: n };
}

async function setProgress(year, quarter, state, extra = {}) {
  await upsert(
    'okx_backfill_progress',
    [{ account: ACCOUNT, year, quarter, state, updated_at: new Date().toISOString(), ...extra }],
    'account,year,quarter'
  );
}

// The archive file is a .zip containing a CSV of the bill ledger.
// Column headers vary by locale/version, so we map tolerantly by header name
// and keep the whole row in `raw`. Adjust HEADER_MAP if your file differs.
const HEADER_MAP = {
  bill_id: ['billId', 'bill id', 'id'],
  ts: ['ts', 'timestamp', 'time', 'utc time'],
  inst_type: ['instType', 'instrument type', 'type'],
  inst_id: ['instId', 'instrument', 'underlying', 'contract'],
  ccy: ['ccy', 'currency', 'coin'],
  type: ['type', 'bill type'],
  subType: ['subType', 'sub type'],
  pnl: ['pnl', 'realized pnl', 'profit and loss'],
  balChg: ['balChg', 'balance change', 'amount', 'change'],
  fee: ['fee', 'fees'],
  bal: ['bal', 'balance'],
  ordId: ['ordId', 'order id'],
  posId: ['posId', 'position id'],
};

function pick(headerIdx, row, keys) {
  for (const k of keys) {
    const i = headerIdx[k.toLowerCase().trim()];
    if (i != null && row[i] !== undefined && row[i] !== '') return row[i];
  }
  return undefined;
}

function parseCsv(text) {
  // Minimal RFC-4180-ish parser (handles quoted fields with commas).
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function downloadAndParseArchive(fileHref) {
  const res = await fetch(fileHref);
  if (!res.ok) throw new Error(`download archive ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  // File may be a zip (of CSV) or a raw CSV depending on OKX version.
  let csvText;
  if (buf.slice(0, 2).toString() === 'PK') {
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find((e) => /\.csv$/i.test(e.entryName)) || zip.getEntries()[0];
    if (!entry) return [];
    csvText = entry.getData().toString('utf8');
  } else {
    csvText = buf.toString('utf8');
  }

  const rows = parseCsv(csvText).filter((r) => r.some((c) => c !== ''));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const headerIdx = {};
  header.forEach((h, i) => { headerIdx[h] = i; });

  const bills = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const b = {};
    for (const [field, keys] of Object.entries(HEADER_MAP)) b[field] = pick(headerIdx, row, keys);
    // normalize timestamp: archive files are usually a date-time string, not epoch ms
    if (b.ts && !/^\d{10,}$/.test(String(b.ts))) {
      const t = Date.parse(String(b.ts).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(b.ts)) ? '' : 'Z'));
      if (!Number.isNaN(t)) b.ts = String(t);
    }
    // synthesize a stable id if the file omits billId (so dedup still works)
    if (!b.bill_id) {
      b.billId = `csv:${b.ts || ''}:${b.type || ''}:${b.subType || ''}:${b.balChg || ''}:${b.ordId || ''}`;
    } else {
      b.billId = b.bill_id;
    }
    bills.push(b);
  }
  return bills;
}
