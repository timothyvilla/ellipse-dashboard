# OKX historical P&L

Pulls OKX realized P&L from the API instead of retaining it in session state
(which reset on login). Everything reads from Supabase, matching the existing
`crypto_trades` / `crypto_snapshots` cron pattern.

## Where each piece lives

| Concern | Code | Notes |
|---|---|---|
| Closed-position P&L, live (~3 mo) | `api/okx/pnl-history.mjs` | The route the dashboard already calls. Serves realized P&L per closed position; **funding is excluded** (it's carry cost, surfaced by `api/okx/funding.mjs`). |
| Persist closed positions hourly | `api/cron/okx-sync.mjs` | Upserts `crypto_positions_history` so history accumulates past OKX's 3-month window automatically. |
| Full ledger since 2021 (one-time) | `bridge/okx-backfill.mjs` | The only non-serverless piece — the archive apply/poll/download can take minutes. Writes `crypto_bills`. |
| Schema | `supabase/…_crypto_pnl_history.sql` | `crypto_positions_history`, `crypto_bills`, `crypto_backfill_progress`, `crypto_pnl_daily` view. |

## Why this also fixes "funding counted as trades"

The dashboard calls `/api/okx/pnl-history` for its Net-P&L / Recent-Trades basis.
That route was **missing**, so the analytics fell back to raw fills and dragged
funding/dust rows into the graded trades list. With the route in place,
`cryptoPnl` populates from real closed positions and funding stays out. In OKX's
ledger, funding is bill `type='8'` and trades are `type='2'` — the backfill tags
both so a "total funding cost" stat is still possible without polluting trades.

## Setup

1. Apply `supabase/…_crypto_pnl_history.sql` in Supabase.
2. Deploy — `api/okx/pnl-history.mjs` and the updated cron ship with the app
   (same env vars you already use: `OKX_API_*`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`).

## One-time deep backfill (only if you want pre-cron history from 2021)

```bash
cd bridge
npm install
cp .env.example .env   # same read-only OKX key + Supabase service role
npm run backfill       # resumable; rerun over a couple of days if it hits OKX's ~12/day apply cap
```

Going forward you don't need this — the hourly cron persists every closed
position, so history keeps growing on its own.
