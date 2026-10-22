-- ============================================================================
-- Harcourt Educational Consult — 0028: rate_per_hour → rate_per_semester
--
-- The tutor's advertised rate has always been displayed as a PER-SEMESTER
-- price (a student books a tutor for a semester and pays 50% up front, the
-- rest by the final session). Only the COLUMN still said "per hour" — the
-- last place the old framing survived.
--
-- This renames the column. The app reads and writes both names, so it can be
-- deployed before this migration is applied (it falls back to the old column
-- and logs a warning), and it keeps working after.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tutor_profiles'
      and column_name = 'rate_per_hour'
  ) and not exists (
    -- Already renamed — nothing to do (safe to re-run).
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tutor_profiles'
      and column_name = 'rate_per_semester'
  ) then
    alter table public.tutor_profiles
      rename column rate_per_hour to rate_per_semester;
  end if;
end $$;

comment on column public.tutor_profiles.rate_per_semester is
  'The tutor''s advertised rate, PER SEMESTER (0028; was rate_per_hour).';
