-- ============================================================================
-- Harcourt — 0022 · Student phone (SMS notifications) + atomic sign-up
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- Adds profiles.phone so the app can text a student about their sessions
-- (Arkesel, see src/lib/sms.ts). Plain text on purpose: format validation
-- lives in Zod (services/auth/schemas.ts) and the SMS layer normalizes to
-- Arkesel's digits-only form at send time, so a bad number can never block a
-- sign-up — same reasoning as session_mode (0021).
--
-- This migration ALSO extends register_user so sign-up stays atomic: the
-- student's program (0019), year (0020), phone (here) and session format
-- (0021) are written in the SAME transaction as the profile and the
-- credential. The 5-argument version from 0021 is DROPPED first — adding
-- parameters with CREATE OR REPLACE creates a second overload instead of
-- replacing it, which would make a 5-named-argument call ambiguous.
--
-- The extra parameters default to NULL, so a caller that omits them (and the
-- 5-argument call the app falls back to when this migration is not applied)
-- still works.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'phone'
  ) then
    alter table public.profiles
      add column phone text;
  end if;
end $$;

-- Drop BOTH older signatures (the 4-arg version from 0003/0010 and the 5-arg
-- version from 0021) so exactly one register_user exists afterwards.
drop function if exists public.register_user(text, text, text, public.user_role, text);
drop function if exists public.register_user(text, text, text, public.user_role);

create or replace function public.register_user(
  p_email         text,
  p_password_hash text,
  p_full_name     text default '',
  p_role          public.user_role default 'student',
  p_session_mode  text default 'one_on_one',
  p_program       text default null,
  p_year          int default null,
  p_phone         text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_id        uuid := gen_random_uuid();
  final_role    public.user_role := p_role;
  final_mode    text := case
                           when p_session_mode = 'group' then 'group'
                           else 'one_on_one'
                         end;
  final_program text := null;
  final_year    smallint := null;
  final_phone   text := null;
begin
  -- Nobody self-registers as admin (same guard as 0003/0021).
  if final_role = 'admin' then
    final_role := 'student';
  end if;

  -- Program / year / phone are the STUDENT's details; a tutor sign-up never
  -- sends them. Values are validated in Zod — the DB just refuses to store
  -- blanks or an out-of-range year instead of trusting the caller.
  if final_role = 'student' then
    final_program := nullif(trim(coalesce(p_program, '')), '');
    if p_year between 1 and 4 then
      final_year := p_year;
    end if;
    final_phone := nullif(trim(coalesce(p_phone, '')), '');
  end if;

  insert into public.profiles (
    id, full_name, role, session_mode, program, year, phone, onboarding_completed_at
  )
  values (
    new_id,
    coalesce(nullif(trim(p_full_name), ''), ''),
    final_role,
    final_mode,
    final_program,
    final_year,
    final_phone,
    now()
  );

  insert into public.credentials (profile_id, email, password_hash)
  values (new_id, lower(trim(p_email)), p_password_hash);

  return new_id;
end;
$$;
