-- cTrader closed-trade (deal) sync.
--
-- Adds the per-account watermark the bridge uses to resume ProtoOADealListReq
-- paging, and makes sure the (account, dedup_key) upsert the sync relies on is
-- actually enforced by a constraint rather than by client-side hope.
--
-- Additive and idempotent — safe to re-run, and safe to apply while the app and
-- the bridge are running. Nothing here rewrites or drops existing data.

-- ── watermark ───────────────────────────────────────────────────────
-- Epoch milliseconds of the newest deal already written for this account.
-- bigint, not timestamptz: the Open API speaks epoch-ms and converting at the
-- boundary is one more place to lose an hour to a timezone.
alter table public.account_live
  add column if not exists last_deal_ts bigint;

comment on column public.account_live.last_deal_ts is
  'Epoch ms of the newest cTrader deal synced into trades for this account. '
  'The bridge resumes paging from here (minus a 1h safety lag). '
  'NULL means the account has never been deal-synced and the next run backfills.';

-- ── dedup constraint ────────────────────────────────────────────────
-- The app already upserts with onConflict 'account,dedup_key' and falls back to
-- a plain insert when the constraint is absent. That fallback is what lets
-- duplicates in across devices. Create the index so the upsert path is the one
-- that actually runs.
--
-- Partial index: legacy rows may have a null dedup_key and must not collide
-- with each other. Only rows carrying a key participate in uniqueness.
create unique index if not exists trades_account_dedup_key_uidx
  on public.trades (account, dedup_key)
  where dedup_key is not null;

comment on index public.trades_account_dedup_key_uidx is
  'Collapses the same closed position arriving from both the API deal sync and '
  'a hand-imported HTML statement onto one row. Both paths derive dedup_key as '
  'tkt:<positionId>.';

-- Deliberately NOT added here: a `source` provenance column. App.jsx's rowOf()
-- does not write one, so adding it now would tag every hand-imported row
-- 'manual' by default and the column would lie. Provenance is already carried
-- by `notes` ('Imported from cTrader' vs 'Synced from cTrader API'). Add the
-- column in the same change that updates rowOf(), not before.

-- ── verifying the index will build ──────────────────────────────────
-- If duplicates already exist the CREATE UNIQUE INDEX above fails. Run this
-- first to see them; keep the row you want and null the other's dedup_key.
--
--   select account, dedup_key, count(*)
--     from public.trades
--    where dedup_key is not null
--    group by 1, 2
--   having count(*) > 1;
