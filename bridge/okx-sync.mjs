#!/usr/bin/env node
// OKX PnL sync runner.
//
//   node okx-sync.mjs recent        # incremental: positions (3mo) + recent bills. Run on your snapshot cron.
//   node okx-sync.mjs positions     # just positions-history
//   node okx-sync.mjs backfill      # one-time (resumable) full history since 2021 into okx_bills
//   node okx-sync.mjs all           # backfill THEN recent
//
// Env: OKX_API_KEY, OKX_API_SECRET, OKX_API_PASSPHRASE, OKX_ACCOUNT_LABEL,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (+ OKX_SIMULATED=1 for demo accounts)

import { syncPositionsHistory, syncRecentBills, backfillBillsSince2021 } from './okx/pnl-sync.mjs';

const cmd = process.argv[2] || 'recent';

async function main() {
  if (cmd === 'positions') {
    console.log(JSON.stringify(await syncPositionsHistory(), null, 2));
  } else if (cmd === 'recent') {
    const pos = await syncPositionsHistory();
    const bills = await syncRecentBills();
    console.log(JSON.stringify({ pos, bills }, null, 2));
  } else if (cmd === 'backfill') {
    const r = await backfillBillsSince2021();
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'all') {
    const bf = await backfillBillsSince2021();
    const pos = await syncPositionsHistory();
    const bills = await syncRecentBills();
    console.log(JSON.stringify({ backfill: bf, pos, bills }, null, 2));
  } else {
    console.error(`Unknown command: ${cmd}. Use: recent | positions | backfill | all`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('sync failed:', e.message || e);
  process.exit(1);
});
