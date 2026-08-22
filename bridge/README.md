# cTrader Open API → Supabase live-P&L bridge

Replaces the old cTrader **cBot** (`cbots/EllipseLivePnl.cs`). Instead of a bot
running inside cTrader Desktop that POSTs to `/api/ctrader/ingest`, this is a
small **read-only** Node process that talks to the cTrader **Open API** directly
over a persistent TLS socket, computes equity / floating P&L per account, and
writes the same Supabase tables the dashboard already reads:

- `account_live` — latest snapshot per account (balance, equity, floating P&L,
  open positions, intraday equity high/low, start-of-day baselines).
- `account_live_history` — ~1 point/min for the equity chart.

No cTrader Desktop, no chart, no cBot. Because the OAuth scope is `accounts`
(read-only), the bridge **cannot place, modify, or close orders** — safe for
funded / prop accounts.

---

## What it does each cycle

1. `ProtoOATraderReq` → account **balance** (scaled by `moneyDigits`).
2. `ProtoOAGetPositionUnrealizedPnLReq` → per-position **net floating P&L** → summed.
3. `ProtoOAReconcileReq` → **open positions** (symbol, side, volume, entry, swap).
4. `equity = balance + floating`; tracks day high/low + start-of-day baselines per
   **GMT+3 server day** (so the drawdown modes are accurate between polls).
5. Upserts `account_live` and (throttled) appends `account_live_history`.

Symbol names come from a one-time `ProtoOASymbolsListReq` per account.

---

## One-time setup

### 1. Register a free Open API application
Go to <https://openapi.ctrader.com> → create an application → copy **Client ID**
and **Client Secret**. Add a **redirect URI** — if you have nothing to host, use
`http://localhost/` (you'll just copy the `?code=…` out of the address bar).

### 2. Configure
```bash
cd bridge/ctrader
npm install
cp .env.example .env
# fill in CTRADER_CLIENT_ID / CTRADER_CLIENT_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
```

### 3. Authorize (once)
```bash
npm run auth
```
Open the printed URL, sign in with your cTrader ID, click **Allow**. You'll be
redirected to your redirect URI with `?code=…`. Paste that URL back in. Tokens are
saved to `.tokens.json` (gitignored) and refreshed automatically from then on.

### 4. Map accounts → dashboard names
The first run prints each account's `ctidTraderAccountId`. Put them in `.env`:
```
CTRADER_ACCOUNTS=tradinghive:30412345,fundedhive2:30498765
```
The name on the left **must** match the dashboard account (`trades.account` /
`challenges.account`). Without this, rows are named by cTrader login and won't line
up with your challenges.

---

## Running

Streaming (live, keeps the socket open, reconnects on drop):
```bash
npm start
```

One-shot snapshot (for Windows Task Scheduler / cron — same code):
```bash
npm run snapshot        # = node bridge.mjs --snapshot
```

Keep it always-on with pm2:
```bash
npm i -g pm2
pm2 start bridge.mjs --name ctrader-bridge
pm2 save
```

**Graceful degradation:** when the bridge is off (machine off), the dashboard shows
the last snapshot and closed-trade figures — nothing breaks.

---

## Environment

| Var | Required | Notes |
|---|---|---|
| `CTRADER_CLIENT_ID` / `CTRADER_CLIENT_SECRET` | ✓ | from the Open API app |
| `CTRADER_REDIRECT_URI` | for `auth` | must be registered on the app; default `http://localhost/` |
| `CTRADER_SCOPE` | | `accounts` (read-only) — **do not** use `trading` on prop accounts |
| `CTRADER_ACCOUNTS` | recommended | `name:ctid,…` mapping to dashboard names |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | ✓ | same service-role creds as the app cron |
| `MODE` | | `stream` (default) or run with `--snapshot` |
| `POLL_MS` | | streaming poll interval, default 5000, min 1000 |
| `HISTORY_MS` | | equity-chart point cadence, default 60000, min 30000 |
| `CTRADER_ACCESS_TOKEN` / `CTRADER_REFRESH_TOKEN` | | optional: run headless from env instead of `.tokens.json` |

Live vs demo endpoint is chosen automatically per account from the account list's
`isLive` flag (`live.ctraderapi.com` / `demo.ctraderapi.com`, port 5035).

---

## Notes

- **Money scaling.** The Open API returns money as scaled integers; the bridge
  divides by `10^moneyDigits` (per message) before storing. Volumes are protocol
  cents → divided by 100 to units.
- **Rate limits.** One snapshot ≈ 3 non-historical requests; well under the
  50 req/s/connection cap even at 1s polling.
- **Security.** Client secret, tokens, and the Supabase service-role key live only
  here (server-side). The browser reads `account_live` through the existing
  session-gated `/api/ctrader/live` route.
- **Protos.** Official Spotware `.proto` files are vendored in `protos/` so there's
  no install-time fetch.

### Optional next phase (not built here)
Closed-deal + cash-flow sync into the `trades` table (`ProtoOADealListReq` +
`ProtoOACashFlowHistoryListReq`) — additive to the manual import, with automatic
phase-reset detection. See `claude/ctrader-live-pnl-design.md` §6 in the project.
