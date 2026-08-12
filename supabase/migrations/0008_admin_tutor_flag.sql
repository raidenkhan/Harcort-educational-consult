-- ============================================================================
-- Harcourt Educational Consult — 0008: admin-as-privilege (admin-tutor flag)
--
-- Until now `profiles.role` was a single exclusive enum: a user was either a
-- student, a tutor, OR an admin. Some tutors are also admins — they need to
-- keep their public tutor listing (and /tutor onboarding) while carrying
-- admin privileges.
--
-- This migration makes admin a *privilege* layered on top of the primary
-- role: `profiles.is_admin boolean`. A tutor who is also an admin has
-- `role = 'tutor'` + `is_admin = true` — they appear in the tutor list like
-- any approved tutor, and the app treats them as admins everywhere.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The flag. Defaults to false so register_user() (which inserts without
--    it) and existing rows are unaffected.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2) Backfill — everyone who was promoted to role='admin' keeps admin rights.
--    New admin-tutors use is_admin = true with role 'student' | 'tutor'.
-- ---------------------------------------------------------------------------
update public.profiles
set is_admin = true
where role = 'admin' and not is_admin;

-- ---------------------------------------------------------------------------
-- 3) The DB-side admin check (used by admin_approve_tutor / admin_reject_tutor
--    and the status-guard trigger) now honors the flag AND the legacy role.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(p_uid uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_uid and (is_admin or role = 'admin')
  );
$$;
