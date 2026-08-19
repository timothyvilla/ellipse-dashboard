-- Live P&L feed (cTrader Open API bridge) + challenge live-risk settings.
--
-- `account_live` holds one upserted snapshot row per account: balance, equity,
-- floating (unrealized) P&L, open positions, and the per-server-day equity
-- extremes the drawdown modes need. The bridge (a local Node process) writes it;
-- the dashboard reads it. Safe to re-run.

create table if not exists public.account_live (
  account                text primary key,           -- matches trades.account / challenges.account
  ctid_trader_account_id bigint,
  balance                numeric not null default 0,  -- realized balance
  equity                 numeric not null default 0,  -- balance + floating_pnl
  floating_pnl           numeric not null default 0,  -- sum of open-position unrealized net P&L
  open_positions         jsonb   not null default '[]'::jsonb,  -- [{positionId,symbol,side,volume,entry,floatPnl}]
  margin_used            numeric,
  day_equity_high        numeric,   -- running peak equity for server_day
  day_equity_low         numeric,   -- running trough equity for server_day
  start_of_day_equity    numeric,   -- equity at GMT+3 midnight (startOfDay DD baseline)
  start_of_day_balance   numeric,   -- balance at GMT+3 midnight (staticBalance DD baseline)
  server_day             date,      -- GMT+3 day the extremes belong to
  updated_at             timestamptz not null default now()
);

comment on table public.account_live is
  'Latest live snapshot per account from the cTrader Open API bridge (balance, equity, floating P&L, open positions, intraday equity extremes).';

-- Per-challenge live-risk settings.
alter table public.challenges
  add column if not exists daily_dd_mode text    not null default 'startOfDay',
  add column if not exists auto_breach   boolean not null default false;

comment on column public.challenges.daily_dd_mode is
  'How daily drawdown is measured against live equity: startOfDay | staticBalance | peakToTrough | trailing.';
comment on column public.challenges.auto_breach is
  'When true, auto-mark the challenge failed if live equity crosses a daily/max drawdown limit; else warn only.';

-- account_live is written AND read only through the server-side API routes using
-- the Supabase service_role key (which bypasses RLS) — matching how crypto_snapshots
-- is handled. RLS is enabled with NO anon/authenticated policy, so the browser's
-- anon key can neither read nor write it directly:
--   • writes  -> POST /api/ctrader/ingest  (cBot, authed by CTRADER_INGEST_KEY)
--   • reads   -> GET  /api/ctrader/live     (session-gated, like /api/okx/snapshots)
alter table public.account_live enable row level security;
-- (no policies on purpose: only the service role, used by the API routes, may touch it)
