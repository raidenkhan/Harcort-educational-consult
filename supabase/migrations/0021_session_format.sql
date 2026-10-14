-- ============================================================================
-- Harcourt — 0021 · Session format (one-on-one or group)
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- A student picks how they want to be tutored when they sign up: a
-- ONE-ON-ONE session (just them and the tutor) or a GROUP session (shared
-- with classmates on the same course). The choice lives on profiles so it
-- travels with the student: the tutor sees it on every request they receive,
-- and the student can change it from their dashboard at any time.
--
-- Why `text` + CHECK instead of a Postgres enum: the allowlist lives in Zod
-- (services/auth/sessionFormat.ts) so adding a third format later is a
-- one-line code change with no migration — same reasoning as the course
-- library's category/file_format columns (0017). The CHECK keeps the DB
-- honest about the values the app can actually render.
--
-- Note: the current data model schedules ONE student per tutoring_session, so
-- "group" is the student's stated requirement (surfaced to tutors + admins
-- who arrange the group), not yet a multi-student session row. Pricing for
-- group sessions is deliberately untouched here.
--
-- Wrapped in a DO block: ADD COLUMN IF NOT EXISTS is supported, but an inline
-- CHECK constraint is not guardable that way, and the Supabase SQL Editor
-- wraps a whole paste in one transaction.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'session_mode'
  ) then
    -- NOT NULL: every student has an answer, and 'one_on_one' is the right
    -- default for pre-0021 rows (the common case, and the safe assumption).
    alter table public.profiles
      add column session_mode text not null default 'one_on_one'
      constraint profiles_session_mode_check check (session_mode in ('one_on_one', 'group'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- register_user — sign-up stays atomic: the profile, the credential and the
-- session format are written in one transaction. Anything unrecognized (or a
-- tutor sign-up, where the picker is never shown) falls back to 'one_on_one'.
--
-- The 4-argument version from 0003/0010 is DROPPED first: adding a parameter
-- with CREATE OR REPLACE would create a second overload instead of replacing
-- it, leaving two callable functions with the same name.
-- ---------------------------------------------------------------------------
drop function if exists public.register_user(text, text, text, public.user_role);

create or replace function public.register_user(
  p_email         text,
  p_password_hash text,
  p_full_name     text default '',
  p_role          public.user_role default 'student',
  p_session_mode  text default 'one_on_one'
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_id         uuid := gen_random_uuid();
  final_role     public.user_role := p_role;
  final_mode     text := case
                           when p_session_mode = 'group' then 'group'
                           else 'one_on_one'
                         end;
begin
  if final_role = 'admin' then
    final_role := 'student';
  end if;

  insert into public.profiles (id, full_name, role, session_mode, onboarding_completed_at)
  values (
    new_id,
    coalesce(nullif(trim(p_full_name), ''), ''),
    final_role,
    final_mode,
    now()
  );

  insert into public.credentials (profile_id, email, password_hash)
  values (new_id, lower(trim(p_email)), p_password_hash);

  return new_id;
end;
$$;
