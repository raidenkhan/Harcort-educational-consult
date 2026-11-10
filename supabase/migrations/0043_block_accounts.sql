-- ============================================================================
-- Harcourt — 0043 · Admins can block a student or tutor
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- A blocked account can't sign in (email or Google), every session it had is
-- revoked when it's blocked, and the session lookup treats it as signed out,
-- so an already-open tab loses access on its next request. A blocked tutor
-- disappears from the directory and can't be booked. Nothing is deleted:
-- bookings, payments and chats stay, and unblocking restores access.
--
--   blocked_at      NULL = active; set = blocked since then
--   blocked_by      the admin who blocked them (kept if that admin leaves)
--   blocked_reason  optional note for the admin team
--
-- The app refuses to block admin accounts (or the acting admin); the write
-- itself goes through the service-role client like every other profile write.
-- ============================================================================

alter table public.profiles
  add column if not exists blocked_at     timestamptz,
  add column if not exists blocked_by     uuid references public.profiles (id) on delete set null,
  add column if not exists blocked_reason text check (char_length(blocked_reason) <= 500);

-- The admin People list filters on it; most rows are NULL.
create index if not exists idx_profiles_blocked
  on public.profiles (blocked_at)
  where blocked_at is not null;

notify pgrst, 'reload schema';
