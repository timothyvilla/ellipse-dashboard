-- ============================================================
-- Ellipse — Crypto section schema
-- Run once in Supabase → SQL Editor.
-- Mirrors the existing app pattern: app falls back to localStorage
-- if these tables don't exist yet, so it is safe to run anytime.
-- ============================================================

-- ---------- Synced + manual crypto trades (fills) ----------
create table if not exists public.crypto_trades (
  id          bigint generated always as identity primary key,
  trade_id    text unique,                 -- OKX fill id; null for manual entries
  ord_id      text,
  inst_id     text not null,               -- e.g. BTC-USDT-SWAP
  side        text,                        -- buy | sell
  pos_side    text,                        -- long | short | net
  fill_sz     numeric default 0,           -- size (contracts / coin)
  fill_px     numeric default 0,           -- fill price
  pnl         numeric default 0,           -- realized PnL (USD)
  fee         numeric default 0,           -- negative = fee paid
  fee_ccy     text,
  exec_type   text,                        -- T (taker) | M (maker)
  ts          timestamptz not null default now(),  -- execution time
  source      text not null default 'okx', -- okx | manual
  notes       text,
  chart_image text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_crypto_trades_ts on public.crypto_trades (ts desc);
create index if not exists idx_crypto_trades_inst on public.crypto_trades (inst_id);

-- ---------- Portfolio equity snapshots (for the equity curve) ----------
-- OKX does not return arbitrary historical equity, so we capture a row
-- on every sync to build a curve over time.
create table if not exists public.crypto_snapshots (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  total_eq    numeric default 0,           -- total account equity (USD)
  upl         numeric default 0,           -- unrealized PnL at snapshot
  balances    jsonb default '[]'::jsonb,   -- per-coin breakdown
  positions   jsonb default '[]'::jsonb,   -- open positions at snapshot
  source      text not null default 'okx',
  created_at  timestamptz not null default now()
);

create index if not exists idx_crypto_snapshots_ts on public.crypto_snapshots (ts desc);

-- ---------- Personal growth challenge ($X -> $Y) ----------
create table if not exists public.crypto_challenges (
  id             bigint generated always as identity primary key,
  name           text not null default 'Growth Challenge',
  start_balance  numeric not null default 1000,
  target_balance numeric not null default 10000,
  current_balance numeric default 0,
  start_date     date not null default current_date,
  target_date    date,
  status         text not null default 'active',   -- active | completed | failed | paused
  milestones     jsonb default '[]'::jsonb,        -- [{ pct, label, hit, hit_date }]
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_crypto_challenges_status on public.crypto_challenges (status);

-- ============================================================
-- OPTIONAL: Row Level Security
-- This app uses the anon key without per-user auth (single-user),
-- matching the existing trades/accounts tables. If those tables have
-- RLS enabled, mirror the same policies here. Otherwise leave RLS off.
-- ============================================================
-- Example (single shared user, anon full access — only if your other
-- tables already do this):
-- alter table public.crypto_trades enable row level security;
-- create policy "anon all crypto_trades" on public.crypto_trades for all using (true) with check (true);
-- (repeat for crypto_snapshots, crypto_challenges)
