# OKX historical P&L → Supabase

Pull OKX realized P&L from the API instead of retaining it in session state (which
resets on login). The dashboard reads Supabase — exactly like the cTrader `trades` /
`account_live` pattern — so history persists across logout and can't drift from OKX.

## Can I get the *full* history? Yes — in two tiers

OKX's live API only serves **~3 months**. Full history comes from a separate
"archive" path. This bridge does both:

| Tier | Endpoint | Covers | Table |
|---|---|---|---|
| 1 — rolling, rich | `GET /api/v5/account/positions-history` | last ~3 months, per-position `realizedPnl` | `okx_positions_history` |
| 1b — recent ledger | `GET /api/v5/account/bills-archive` | last ~3 months, full ledger | `okx_bills` (`source='live'`) |
| **2 — full since 2021** | `POST`+`GET /api/v5/account/bills-history-archive` | **everything back to Jan 2021**, quarterly files | `okx_bills` (`source='archive'`) |

Tier 2 works by *applying* for a quarter's ledger, waiting for OKX to generate a
downloadable file, then downloading + parsing it. The apply call is rate-limited
(~12/day), so `backfill` is **resumable**: progress is tracked per quarter in
`okx_backfill_progress`, and rerunning skips quarters already done.

> Beyond ~1 year the *UI* only lets you view, but the archive **download** goes back to
> 2021 — that's what Tier 2 uses, so you genuinely get full history.

## Setup

1. Create a **read-only** OKX API key (no trade/withdraw perms) → key, secret, passphrase.
2. `cd bridge && npm install`
3. `cp .env.example .env` and fill it in (`OKX_ACCOUNT_LABEL` must match this account's
   `trades.account`).
4. Apply the migration in `supabase/20260820_okx_pnl_history.sql`.

## Run

```bash
# One-time full backfill (resumable; rerun over a few days if it hits the apply cap)
npm run backfill

# Ongoing — wire into your existing snapshot cron / Task Scheduler alongside the cTrader bridge
npm run recent        # positions-history (3mo) + recent bills, every interval
```

`recent` is idempotent (upsert by `pos_id` / `bill_id`), so run it as often as your
snapshot cadence — it just refreshes the rolling window and dedupes.

## What the dashboard reads

- `okx_positions_history` — closed positions with fee-inclusive `realized_pnl`. **Use this
  for the Recent Trades card** (see `bridge/recent-trades-fix.md`).
- `okx_bills` — full ledger; funding rows are `type='8'`, trades are `type='2'`.
- `okx_pnl_daily` (view) — per-server-day realized P&L, positions for the rolling window
  and bills for older days, so a daily P&L chart is continuous from 2021 to today.

## Notes

- **Funding ≠ trades.** The "F" rows in Recent Trades are funding fees (`type='8'`), not
  trades (`type='2'`). Fixed by reading `okx_positions_history` — see the fix doc.
- **Money scaling:** unlike the cTrader API, OKX returns decimal strings (not scaled
  integers), so values are used as-is via `Number()`.
- **Server day:** everything is stamped on the GMT+3 broker day (`MT5_SERVER_OFFSET_MIN`)
  to line up with the cTrader daily breakdown.
- **Archive CSV columns** can vary by account locale/version. If a backfill parses blank
  rows, adjust `HEADER_MAP` in `bridge/okx/pnl-sync.mjs` to your file's headers (the whole
  row is always preserved in `raw`).
```
