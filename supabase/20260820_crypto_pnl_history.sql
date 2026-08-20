-- Crypto (OKX) historical P&L — persistence so history survives past the API's
-- ~3-month live window and never lives in browser/session state.
--
-- Naming matches the existing crypto_* schema (crypto_trades / crypto_snapshots
-- / crypto_challenges). Written by:
--   • api/cron/okx-sync.mjs        -> crypto_positions_history (rolling, hourly)
--   • bridge/okx-backfill.mjs      -> crypto_positions_history + crypto_bills (one-time, since 2021)
-- Read by:
--   • api/okx/pnl-history.mjs      -> merges persisted rows with the live 3-month window

-- Closed positions with fee-inclusive realized P&L (one row per OKX posId).
create table if not exists public.crypto_positions_history (
  pos_id        text primary key,
  inst_id       text,
  inst_type     text,
  pos_side      text,               -- long | short | net
  lever         numeric,
  open_avg_px   numeric,
  close_avg_px  numeric,
  open_time     timestamptz,        -- OKX cTime
  close_time    timestamptz,        -- OKX uTime
  realized_pnl  numeric,            -- pnl + fee + fundingFee + liqPenalty + settledPnl (fees in, funding out)
  pnl           numeric,            -- excluding fees
  fee           numeric,
  funding_fee   numeric,
  liq_penalty   numeric,
  pnl_ratio     numeric,
  ccy           text,
  source        text not null default 'cron',   -- 'cron' | 'backfill'
  raw           jsonb,
  updated_at    timestamptz not null default now()
);
create index if not exists crypto_positions_history_close_idx on public.crypto_positions_history (close_time);

-- Full account ledger since 2021 (deep backfill via quarterly archive files).
-- Funding = type '8', trades = type '2'. Keeps funding OUT of the trades feed
-- while still recording it for a "total funding cost" stat.
create table if not exists public.crypto_bills (
  bill_id     text primary key,
  ts          timestamptz,
  inst_type   text,
  inst_id     text,
  ccy         text,
  type        text,                 -- '2' trade, '8' funding fee, ...
  sub_type    text,
  pnl         numeric,
  bal_chg     numeric,
  fee         numeric,
  bal         numeric,
  ord_id      text,
  pos_id      text,
  source      text not null default 'backfill',
  raw         jsonb,
  updated_at  timestamptz not null default now()
);
create index if not exists crypto_bills_ts_idx on public.crypto_bills (ts);
create index if not exists crypto_bills_pnl_idx on public.crypto_bills (ts) where pnl is not null and pnl <> 0;

-- Resumable backfill bookkeeping (one row per year+quarter).
create table if not exists public.crypto_backfill_progress (
  year        int  not null,
  quarter     text not null,        -- Q1 | Q2 | Q3 | Q4
  state       text not null default 'pending',  -- pending | requested | done | empty | error
  file_href   text,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (year, quarter)
);

-- Per-day realized-PnL rollup: closed positions for the rich window, bills'
-- pnl rows for older days — continuous daily series from 2021 to today.
create or replace view public.crypto_pnl_daily as
with pos as (
  select (close_time)::date as day,
         sum(realized_pnl) as realized_pnl,
         sum(fee)          as fee,
         sum(funding_fee)  as funding_fee,
         count(*)          as closed_positions,
         'positions'::text as src
  from public.crypto_positions_history
  group by (close_time)::date
),
bill_days as (
  select (b.ts)::date as day,
         sum(b.pnl) filter (where b.pnl is not null) as realized_pnl,
         sum(b.fee) filter (where b.fee is not null) as fee,
         0::numeric as funding_fee,
         count(*) filter (where b.pnl is not null and b.pnl <> 0) as closed_positions,
         'bills'::text as src
  from public.crypto_bills b
  where not exists (select 1 from pos p where p.day = (b.ts)::date)
  group by (b.ts)::date
)
select * from pos
union all
select * from bill_days;

-- RLS on to match crypto_trades; dashboard reads via anon under existing policies.
alter table public.crypto_positions_history enable row level security;
alter table public.crypto_bills             enable row level security;
alter table public.crypto_backfill_progress enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='crypto_positions_history' and policyname='crypto_pos_read') then
    create policy crypto_pos_read on public.crypto_positions_history for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='crypto_bills' and policyname='crypto_bills_read') then
    create policy crypto_bills_read on public.crypto_bills for select using (true);
  end if;
end $$;
