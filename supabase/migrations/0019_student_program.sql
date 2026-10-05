-- ============================================================================
-- Harcourt — 0019 · Student program personalization
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- A student declares the program they study (e.g. "Mechanical Engineering").
-- `program` mirrors a `courses.subject` value (subjects ARE the programs in
-- the current taxonomy), so the dashboard can filter the student's courses by
-- it. Nullable on purpose: it's set after sign-up from the dashboard picker,
-- never at registration. Validation against the known subjects happens at the
-- app layer (services/auth/schemas.ts + the picker's option list), matching
-- how the rest of the profile is scoped through the service-role client.
-- ============================================================================

alter table public.profiles
  add column if not exists program text;
