-- ============================================================================
-- Harcourt Educational Consult — Phase 2: tutoring sessions (timetable)
--
-- Tutors schedule sessions with the students who contact them; both the tutor
-- and the student independently confirm attendance ("tick") when they meet.
-- The admin sees both ticks per session, so it's clear whether a tutor is
-- actually doing the job.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
--
--   tutor_confirmed_at   set when the TUTOR ticks
--   student_confirmed_at set when the STUDENT ticks
--   (null = not yet confirmed)
-- ============================================================================

create table if not exists public.tutoring_sessions (
  id                  uuid primary key default gen_random_uuid(),
  tutor_profile_id    uuid not null references public.tutor_profiles (id) on delete cascade,
  student_id          uuid not null references public.profiles (id) on delete cascade,
  scheduled_at        timestamptz not null,
  duration_minutes    integer not null default 60 check (duration_minutes between 15 and 480),
  topic               text,
  location            text,
  notes               text,
  tutor_confirmed_at  timestamptz,
  student_confirmed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_sessions_tutor   on public.tutoring_sessions (tutor_profile_id, scheduled_at);
create index if not exists idx_sessions_student on public.tutoring_sessions (student_id, scheduled_at);

-- Server-only table (like credentials/sessions): no policies at all, so the
-- anon/authenticated keys can never touch it. All access goes through the
-- service-role client, which bypasses RLS and performs its own authorization.
alter table public.tutoring_sessions enable row level security;
-- (No policies on purpose.)
