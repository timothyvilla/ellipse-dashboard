#!/usr/bin/env node
// bridge/okx-backfill.mjs
// One-time (resumable) backfill of OKX's full ledger since 2021 into crypto_bills.
//
//   node okx-backfill.mjs            # backfill every quarter 2021..now (resumes; skips done)
//   node okx-backfill.mjs 2023       # backfill from 2023 onward
//
// Env (see .env.example): OKX_API_KEY/SECRET/PASSPHRASE (read-only),
//                         SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Rerun freely — OKX rate-limits the apply step (~12/day), so on a big range
// this may need to run across a couple of days; finished quarters are skipped.

import { backfillBillsSince2021 } from './okx/backfill.mjs';

const startYear = Number(process.argv[2]) || 2021;

backfillBillsSince2021({ startYear })
  .then((r) => { console.log(JSON.stringify(r, null, 2)); })
  .catch((e) => { console.error('backfill failed:', e.message || e); process.exit(1); });
