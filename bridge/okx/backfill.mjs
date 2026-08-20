// bridge/okx/backfill.mjs
// One-time, resumable backfill of OKX's FULL ledger since 2021 into crypto_bills.
//
// This is the ONLY OKX piece that isn't serverless: the archive flow is
// apply -> wait (can take minutes) -> download a zip -> parse. That doesn't fit
// a short Vercel function, so it runs as a script you invoke once (rerun to
// resume — progress is tracked per quarter in crypto_backfill_progress).
//
// The rolling ~3-month window is handled live by api/okx/pnl-history.mjs and
// persisted hourly by api/cron/okx-sync.mjs, so this only fills the deep past.
//
//   POST /api/v5/account/bills-history-archive  { year, quarter }  -> apply (~12/day)
//   GET  /api/v5/account/bills-history-archive?year=&quarter=      -> { state, fileHref }
// Funding rows are type '8', trades are type '2' — both stored, tagged, so the
// dashboard can keep funding out of the trades feed.

import AdmZip from 'adm-zip';
import { okxRequest, sleep } from './_client.mjs';
import { upsert, supa } from './_supabase.mjs';

const num = (v) => (v === '' || v == null ? null : Number(v));
const iso = (ms) => (ms ? new Date(Number(ms)).toISOString() : null);

export async function backfillBillsSince2021({ startYear = 2021, endYear } = {}) {
  const now = new Date(Number(process.env.BACKFILL_NOW_MS) || Date.parse('2026-08-20T00:00:00Z'));
  endYear = endYear || now.getUTCFullYear();
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
  const qStartMonth = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 };

  const targets = [];
  for (let y = startYear; y <= endYear; y++) {
    for (const q of quarters) {
      if (new Date(Date.UTC(y, qStartMonth[q], 1)) > now) continue; // skip future quarters
      targets.push({ year: y, quarter: q });
    }
  }

  const { data: prog } = await supa()
    .from('crypto_backfill_progress')
    .select('year,quarter,state');
  const done = new Set((prog || []).filter((p) => ['done', 'empty'].includes(p.state)).map((p) => `${p.year}${p.quarter}`));

  const results = [];
  for (const t of targets) {
    if (done.has(`${t.year}${t.quarter}`)) { results.push({ ...t, skipped: true }); continue; }
    try {
      const r = await backfillOneQuarter(t.year, t.quarter);
      results.push({ ...t, ...r });
    } catch (e) {
      await setProgress(t.year, t.quarter, 'error', { note: String(e.message || e) });
      results.push({ ...t, error: String(e.message || e) });
      if (e.okxCode === '50011' || /rate limit|too many/i.test(String(e.message))) {
        results.push({ note: 'apply rate limit hit — rerun later to resume' });
        break;
      }
    }
  }
  return results;
}

async function backfillOneQuarter(year, quarter) {
  await okxRequest('POST', '/api/v5/account/bills-history-archive', { body: { year: String(year), quarter } });
  await setProgress(year, quarter, 'requested');

  let fileHref = null;
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const { data } = await okxRequest('GET', '/api/v5/account/bills-history-archive', {
      params: { year: String(year), quarter },
    });
    const row = data?.[0];
    if (row?.state === 'finished' && row.fileHref) { fileHref = row.fileHref; break; }
  }
  if (!fileHref) throw new Error(`archive ${year} ${quarter} not ready after polling`);

  const bills = await downloadAndParseArchive(fileHref);
  if (!bills.length) { await setProgress(year, quarter, 'empty', { file_href: fileHref }); return { upserted: 0, empty: true }; }

  const rows = bills.map((b) => ({
    bill_id: b.billId, ts: iso(b.ts), inst_type: b.instType, inst_id: b.instId, ccy: b.ccy,
    type: b.type, sub_type: b.subType, pnl: num(b.pnl), bal_chg: num(b.balChg), fee: num(b.fee),
    bal: num(b.bal), ord_id: b.ordId || null, pos_id: b.posId || null, source: 'backfill', raw: b,
  }));
  const n = await upsert('crypto_bills', rows, 'bill_id');
  await setProgress(year, quarter, 'done', { file_href: fileHref, note: `${n} rows` });
  return { upserted: n };
}

async function setProgress(year, quarter, state, extra = {}) {
  await upsert('crypto_backfill_progress',
    [{ year, quarter, state, updated_at: new Date().toISOString(), ...extra }], 'year,quarter');
}

// ---- archive file (.zip of CSV) parsing -----------------------------------
const HEADER_MAP = {
  bill_id: ['billId', 'bill id', 'id'], ts: ['ts', 'timestamp', 'time', 'utc time'],
  instType: ['instType', 'instrument type', 'type'], instId: ['instId', 'instrument', 'underlying', 'contract'],
  ccy: ['ccy', 'currency', 'coin'], type: ['type', 'bill type'], subType: ['subType', 'sub type'],
  pnl: ['pnl', 'realized pnl', 'profit and loss'], balChg: ['balChg', 'balance change', 'amount', 'change'],
  fee: ['fee', 'fees'], bal: ['bal', 'balance'], ordId: ['ordId', 'order id'], posId: ['posId', 'position id'],
};

function pick(headerIdx, row, keys) {
  for (const k of keys) { const i = headerIdx[k.toLowerCase().trim()]; if (i != null && row[i] !== undefined && row[i] !== '') return row[i]; }
  return undefined;
}

function parseCsv(text) {
  const rows = []; let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; } }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function downloadAndParseArchive(fileHref) {
  const res = await fetch(fileHref);
  if (!res.ok) throw new Error(`download archive ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  let csvText;
  if (buf.slice(0, 2).toString() === 'PK') {
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find((e) => /\.csv$/i.test(e.entryName)) || zip.getEntries()[0];
    if (!entry) return [];
    csvText = entry.getData().toString('utf8');
  } else csvText = buf.toString('utf8');

  const rows = parseCsv(csvText).filter((r) => r.some((c) => c !== ''));
  if (rows.length < 2) return [];
  const headerIdx = {};
  rows[0].forEach((h, i) => { headerIdx[h.toLowerCase().trim()] = i; });

  const bills = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; const b = {};
    for (const [field, keys] of Object.entries(HEADER_MAP)) b[field] = pick(headerIdx, row, keys);
    if (b.ts && !/^\d{10,}$/.test(String(b.ts))) {
      const s = String(b.ts).replace(' ', 'T');
      const t = Date.parse(s + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
      if (!Number.isNaN(t)) b.ts = String(t);
    }
    b.billId = b.bill_id || `csv:${b.ts || ''}:${b.type || ''}:${b.subType || ''}:${b.balChg || ''}:${b.ordId || ''}`;
    bills.push(b);
  }
  return bills;
}
