-- ============================================================================
-- Harcourt — 0018 · Semesters on course materials & tutorial videos
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- Under one course, content is now grouped by term: a course's materials and
-- videos can be tagged Semester 1 or Semester 2 (and left untagged while
-- nobody has decided), and /courses/[id] renders a section per semester.
--
-- NULL means "not assigned yet" — deliberately allowed, so publishing is
-- never blocked on knowing the term. The app layer groups NULLs into their
-- own bucket rather than hiding them.
--
-- The column is added on the ASSETS, not on courses: a single course runs in
-- one term, so tagging the course itself would produce exactly one group and
-- nothing would move.
--
-- Wrapped in DO blocks: `ALTER TABLE ADD COLUMN IF NOT EXISTS` is supported,
-- but an inline CHECK constraint is not guardable that way, and the Supabase
-- SQL Editor wraps a whole paste in one transaction — so the guard has to be
-- explicit for the script to stay re-runnable.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_materials'
      and column_name = 'semester'
  ) then
    alter table public.course_materials
      add column semester smallint
      constraint course_materials_semester_check check (semester in (1, 2));
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_videos'
      and column_name = 'semester'
  ) then
    alter table public.course_videos
      add column semester smallint
      constraint course_videos_semester_check check (semester in (1, 2));
  end if;
end $$;
