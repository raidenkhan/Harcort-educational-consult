-- ============================================================================
-- Harcourt Educational Consult — 0014: repair tutor_profiles integrity
--
-- Background (2026-09-28 production 500 on / and /tutors):
--   The public tutor listing embeds `profiles` and filters
--   `.neq("profiles.role", "student")`. PostgREST keeps rows whose embed
--   fails the filter but nulls the embed; rendering such rows crashed with
--   "Cannot read properties of null (reading 'full_name')" (fixed in app
--   code by the !inner join + toTutorListings guard). Separately, two
--   tutor_profiles rows pointed at profile ids that no longer exist — the
--   `tutor_profiles.profile_id → profiles(id) on delete cascade` FK is
--   missing from the live database, so hard-deleted profiles left orphans.
--   This migration removes the orphans and restores the FK.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- 1) Drop orphans: tutor_profiles whose profile no longer exists.
--    (The FK below enforces this from now on; this cleans existing rows.)
delete from public.tutor_profiles tp
where not exists (
  select 1 from public.profiles p where p.id = tp.profile_id
);

-- 2) Restore the referential-integrity FK that should have existed since
--    0001 (named per Postgres default so the IF EXISTS check is predictable).
alter table public.tutor_profiles
  drop constraint if exists tutor_profiles_profile_id_fkey;

alter table public.tutor_profiles
  add constraint tutor_profiles_profile_id_fkey
  foreign key (profile_id)
  references public.profiles (id)
  on delete cascade;

-- 3) Belt and braces: the lookup index Postgres needs to enforce it cheaply.
create index if not exists idx_tutor_profiles_profile
  on public.tutor_profiles (profile_id);

-- 4) Housekeeping: keep tutor_services from the same orphan fate. The 0001
--    FK tutor_services.tutor_profile_id → tutor_profiles on delete cascade
--    covers future deletions; this only cleans rows that predate it.
delete from public.tutor_services ts
where not exists (
  select 1 from public.tutor_profiles tp where tp.id = ts.tutor_profile_id
);
