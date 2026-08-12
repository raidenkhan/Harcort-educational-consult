-- ============================================================================
-- Harcourt Educational Consult — Phase: admin conversations
-- Apply in: Supabase Dashboard → SQL Editor (paste & run)
-- Safe to re-run.
--
-- What this gives you:
--   1. Conversations can have an ADMIN participant (student↔admin or
--      tutor↔admin), so students/tutors can reach the Harcourt team in-chat —
--      the admin side shows a Twitter-style verified badge in the UI.
--   2. Integrity: a conversation has exactly TWO participants (student+tutor,
--      student+admin, or tutor+admin).
--   3. Dedup: unique indexes so admin conversations aren't duplicated
--      (Postgres treats NULLs as distinct in unique constraints, so the
--      existing student↔tutor unique can't cover them).
-- ============================================================================

-- 1. Either side may now be the admin instead of a student/tutor.
alter table public.conversations alter column student_id drop not null;
alter table public.conversations alter column tutor_profile_id drop not null;

alter table public.conversations add column if not exists admin_id uuid
  references public.profiles (id) on delete cascade;

-- 2. Exactly two participants.
alter table public.conversations drop constraint if exists conversations_two_participants;
alter table public.conversations add constraint conversations_two_participants check (
  (case when student_id is not null then 1 else 0 end)
  + (case when tutor_profile_id is not null then 1 else 0 end)
  + (case when admin_id is not null then 1 else 0 end) = 2
);

-- NOTE: the 0001 SQL function is_conversation_member() and the conversations
-- RLS policies don't know about admin_id. Harmless today (the app runs every
-- query through the service-role client, bypassing RLS), but extend that
-- function/policy if an anon/authenticated client path is ever re-enabled.

-- 3. Dedupe admin conversations.
drop index if exists idx_conversations_admin_student;
create unique index idx_conversations_admin_student
  on public.conversations (admin_id, student_id)
  where admin_id is not null and student_id is not null and tutor_profile_id is null;

drop index if exists idx_conversations_admin_tutor;
create unique index idx_conversations_admin_tutor
  on public.conversations (admin_id, tutor_profile_id)
  where admin_id is not null and tutor_profile_id is not null and student_id is null;
