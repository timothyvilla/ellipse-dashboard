# Crypto Section (OKX) — Setup

This adds a **Crypto** section to Ellipse with four sub-tabs: **Portfolio**, **Challenge**, **Trades**, and **Analytics**, backed by a live read-only OKX sync.

## How it works

The browser never holds your OKX secret. A small set of Vercel serverless functions (`/api/okx/*`) sign requests server-side using environment variables and return only the data the dashboard needs. The React app calls `/api/okx/balance`, `/api/okx/positions`, and `/api/okx/fills`.

```
Browser (CryptoView)  →  /api/okx/*  (Vercel function, signs request)  →  OKX v5 API
        ↑ Supabase (crypto_trades, crypto_snapshots, crypto_challenges)
```

## 1. Create a read-only OKX API key

In OKX → **Account → API**, create a key with:

- Permission: **Read only** (NOT Trade, NOT Withdraw)
- Set a passphrase (you choose it)
- Optional but recommended: restrict to your Vercel egress IPs if you have static ones

You'll get three values: **API Key**, **Secret Key**, **Passphrase**.

## 2. Add the keys to Vercel (never commit them)

Vercel → Project → **Settings → Environment Variables**, add for Production (and Preview if you use it):

| Name | Value |
|------|-------|
| `OKX_API_KEY` | your API key |
| `OKX_API_SECRET` | your secret key |
| `OKX_API_PASSPHRASE` | your passphrase |

Redeploy so the functions pick them up.

> For local testing, put the same three vars in a `.env` (already git-ignored) and run with `vercel dev` so the `/api` functions execute. Plain `vite dev` will not run the serverless functions.

## 3. Run the database migration

In Supabase → **SQL Editor**, paste and run `supabase/crypto_migration.sql`. It creates:

- `crypto_trades` — synced OKX fills + manual entries (deduped on `trade_id`)
- `crypto_snapshots` — equity snapshots written on each sync (powers the equity curve)
- `crypto_challenges` — your personal $X→$Y growth challenges

The app falls back to `localStorage` if these tables are missing, so nothing breaks before you run it — but syncing across devices requires the tables.

## 4. Use it

1. Open the **Crypto → OKX Trading** tab.
2. Click **Sync OKX** (top right). This pulls balance, open positions, and recent fills, and writes a snapshot.
3. Go to **Challenge → New Challenge** to set a start balance, target, and (optional) deadline. The active challenge's current balance auto-updates to your live OKX equity on each sync.
4. **Trades** is your private results feed — synced fills plus any manual trades you add.
5. **Analytics** shows net P&L, win rate, profit factor, cumulative P&L, and P&L by coin.

## Notes & limits

- OKX `fills-history` covers roughly the **last 3 months**. Sync periodically so older fills are captured before they age out. (You can also automate this with a scheduled sync later.)
- The equity curve needs **at least two syncs** to draw a line.
- The proxy is tuned for **derivatives (SWAP/perps)**: positions and fills use `instType=SWAP`. If you later add spot, extend `positions.js`/`fills.js` to also query `instType=SPOT`.
- Keys are read-only, so the dashboard can never place trades or move funds.

## Files added

```
api/okx/_okx.mjs        signer + fetch helper
api/okx/balance.mjs     GET account balance
api/okx/positions.mjs   GET open SWAP positions
api/okx/fills.mjs        GET recent SWAP fills
supabase/crypto_migration.sql   schema
src/App.jsx            new Crypto section + sync logic (CryptoView and sub-components)
```
