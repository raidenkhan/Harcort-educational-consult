-- ============================================================================
-- Harcourt — 0020 · Course year tier (Program → Year → Course)
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- Gives the taxonomy a year level between program (courses.subject) and
-- course, so the board's "Sign in → Program → Year → Course" flow has a
-- year to hang off. `year` is smallint 1–4 (KNUST engineering) on BOTH:
--
--   courses.year  — the year a course is normally taken in; NULL means the
--                   course isn't tied to one year (general/spanning courses
--                   still appear under every year).
--   profiles.year — the student's current year; NULL until they pick one.
--
-- Nullable on purpose (not every course is year-specific and picking a year
-- is optional); the app layer constrains values to 1–4 via the picker and
-- Zod. Apply 0019 first (adds profiles.program); this builds on it.
-- ============================================================================

alter table public.courses
  add column if not exists year smallint;

alter table public.profiles
  add column if not exists year smallint;
