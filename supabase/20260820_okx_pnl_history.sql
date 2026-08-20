-- OKX historical P&L — data model
-- Mirrors the additive cTrader deal-sync pattern: the dashboard reads these
-- tables from Supabase (never OKX directly), so PnL survives logout instead of
-- living in browser/session state that resets on login.
--
-- Two tiers, because OKX's live API only serves ~3 months:
--   * okx_positions_history  <- GET /api/v5/account/positions-history  (rolling ~3mo, rich per-position realizedPnl)
--   * okx_bills              <- bills-history-archive quarterly files   (full ledger since 2021 -> deep realized-PnL history)
-- okx_pnl_daily unifies both into a per-server-day realized-PnL rollup for the dashboard.

-- ---------------------------------------------------------------------------
-- 1) Rolling closed-position history (last ~3 months, refreshed each sync)
-- ---------------------------------------------------------------------------
create table if not exists public.okx_positions_history (
  pos_id         text primary key,             -- OKX posId (dedup key)
  account        text not null,                -- matches trades.account / challenge.account
  inst_type      text,                         -- SWAP / FUTURES / MARGIN / OPTION
  inst_id        text,                         -- e.g. BTC-USDT-SWAP
  mgn_mode       text,                         -- cross / isolated
  pos_side       text,                         -- long / short / net
  lever          numeric,
  open_avg_px    numeric,
  close_avg_px   numeric,
  open_time      timestamptz,                  -- from cTime
  close_time     timestamptz,                  -- from uTime
  server_day     date,                         -- GMT+3 broker day of close_time (matches cTrader standardization)
  realized_pnl   numeric,                      -- realizedPnl = pnl + fee + fundingFee + liqPenalty + settledPnl
  pnl            numeric,                       -- P&L excluding fees
  fee            numeric,
  funding_fee    numeric,
  liq_penalty    numeric,
  pnl_ratio      numeric,
  ccy            text,
  raw            jsonb,                         -- full OKX row, for future fields
  updated_at     timestamptz not null default now()
);

create index if not exists okx_positions_history_account_day_idx
  on public.okx_positions_history (account, server_day);
create index if not exists okx_positions_history_close_time_idx
  on public.okx_positions_history (close_time);

-- ---------------------------------------------------------------------------
-- 2) Full account ledger since 2021 (deep backfill via quarterly archive files)
--    Every fee/funding/realized-PnL credit. Realized-PnL rows are pnl <> 0.
-- ---------------------------------------------------------------------------
create table if not exists public.okx_bills (
  bill_id        text primary key,             -- OKX billId (dedup key across archive + live)
  account        text not null,
  ts             timestamptz,                  -- bill timestamp
  server_day     date,                         -- GMT+3 broker day
  inst_type      text,
  inst_id        text,
  ccy            text,
  type           text,                         -- bill type code (2 = trade, 8 = funding fee, ...)
  sub_type       text,                         -- bill subType code
  pnl            numeric,                      -- realized P&L component of the bill
  bal_chg        numeric,                      -- balance change
  fee            numeric,                      -- negative = cost, positive = rebate
  bal            numeric,                      -- balance after
  ord_id         text,
  pos_id         text,
  source         text not null default 'archive', -- 'archive' (since-2021 file) | 'live' (bills-archive 3mo)
  raw            jsonb,
  updated_at     timestamptz not null default now()
);

create index if not exists okx_bills_account_day_idx on public.okx_bills (account, server_day);
create index if not exists okx_bills_ts_idx on public.okx_bills (ts);
create index if not exists okx_bills_pnl_idx on public.okx_bills (account, ts) where pnl is not null and pnl <> 0;

-- ---------------------------------------------------------------------------
-- 3) Backfill progress bookkeeping — which (account, year, quarter) archives
--    have been pulled, so the one-time backfill is resumable and idempotent.
-- ---------------------------------------------------------------------------
create table if not exists public.okx_backfill_progress (
  account     text not null,
  year        int  not null,
  quarter     text not null,                   -- Q1 / Q2 / Q3 / Q4
  state       text not null default 'pending', -- pending | requested | done | empty | error
  file_href   text,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (account, year, quarter)
);

-- ---------------------------------------------------------------------------
-- 4) Unified per-day realized-PnL rollup for the dashboard.
--    Prefers positions-history for the rolling window (richer, fee-inclusive),
--    falls back to bills' pnl rows for days older than what the live API serves.
-- ---------------------------------------------------------------------------
create or replace view public.okx_pnl_daily as
with pos as (
  select account, server_day,
         sum(realized_pnl) as realized_pnl,
         sum(pnl)          as gross_pnl,
         sum(fee)          as fee,
         sum(funding_fee)  as funding_fee,
         count(*)          as closed_positions,
         'positions'::text as src
  from public.okx_positions_history
  group by account, server_day
),
bill_days as (
  -- days that positions-history does NOT cover (older than the rolling window)
  select b.account, b.server_day,
         sum(b.pnl) filter (where b.pnl is not null)  as realized_pnl,
         sum(b.pnl) filter (where b.pnl is not null)  as gross_pnl,
         sum(b.fee) filter (where b.fee is not null)  as fee,
         0::numeric                                   as funding_fee,
         count(*) filter (where b.pnl is not null and b.pnl <> 0) as closed_positions,
         'bills'::text as src
  from public.okx_bills b
  where not exists (
    select 1 from pos p
    where p.account = b.account and p.server_day = b.server_day
  )
  group by b.account, b.server_day
)
select * from pos
union all
select * from bill_days;

-- RLS: dashboard reads with the existing anon client under your existing policies.
alter table public.okx_positions_history enable row level security;
alter table public.okx_bills             enable row level security;
alter table public.okx_backfill_progress enable row level security;

-- Read-only for the dashboard's anon role (adjust to match your existing trades policy).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'okx_positions_history' and policyname = 'okx_pos_read') then
    create policy okx_pos_read on public.okx_positions_history for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'okx_bills' and policyname = 'okx_bills_read') then
    create policy okx_bills_read on public.okx_bills for select using (true);
  end if;
end $$;
