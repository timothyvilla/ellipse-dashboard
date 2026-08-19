-- Evaluation-rule settings for challenges.
--
-- Adds optional, per-challenge rule toggles used by the progression gate:
--   * consistency score (max share of total profit from a single day)
--   * profitable-days requirement (min number of qualifying days, and the
--     per-day profit threshold, as a % of account size, that makes a day count)
--
-- All columns are nullable / defaulted so existing rows and the app's
-- localStorage fallback keep working. Safe to re-run.

alter table public.challenges
  add column if not exists consistency_enabled       boolean          not null default false,
  add column if not exists profitable_days_enabled   boolean          not null default false,
  add column if not exists min_profitable_days        integer          not null default 0,
  add column if not exists profitable_day_threshold   numeric          not null default 0;

comment on column public.challenges.consistency_enabled is
  'Whether the consistency rule (consistency_rule) is enforced for this challenge.';
comment on column public.challenges.profitable_days_enabled is
  'Whether the minimum-profitable-days rule is enforced for this challenge.';
comment on column public.challenges.min_profitable_days is
  'Minimum number of qualifying profitable days required to progress.';
comment on column public.challenges.profitable_day_threshold is
  'A day counts as profitable when its net P&L reaches this % of account size (0 = any net-positive day).';
