-- Live equity/balance time-series for the Dashboard's Balance & Equity chart.
--
-- account_live holds only the latest snapshot; this append-only table keeps a
-- point roughly once a minute (the ingest throttles via account_live.last_history_ts)
-- so a curve can be drawn. Service-role only, like account_live. Safe to re-run.

create table if not exists public.account_live_history (
  id           bigint generated always as identity primary key,
  account      text        not null,
  ts           timestamptz not null default now(),
  balance      numeric     not null default 0,
  equity       numeric     not null default 0,
  floating_pnl numeric     not null default 0
);

create index if not exists account_live_history_account_ts
  on public.account_live_history (account, ts);

alter table public.account_live_history enable row level security;
-- (no policies: only the service-role API routes read/write it)

-- Throttle marker so the ingest inserts a history row at most ~once per minute.
alter table public.account_live
  add column if not exists last_history_ts timestamptz;
