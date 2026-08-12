-- ============================================================================
-- Harcourt Educational Consult — Phase 2b: session cancellations (soft delete)
--
-- Cancelling a session now marks it 'cancelled' instead of deleting the row,
-- so the admin's attendance tracker keeps a record of who cancelled and when.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- --- status enum (guarded so the migration is re-runnable) ------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum ('scheduled', 'cancelled');
  end if;
end
$$;

-- --- columns ----------------------------------------------------------------
-- Existing rows keep 'scheduled' (nothing was ever soft-cancelled before).
alter table public.tutoring_sessions
  add column if not exists status       public.session_status not null default 'scheduled',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles (id) on delete set null;

create index if not exists idx_sessions_status on public.tutoring_sessions (status);

-- RLS stays deny-all (server-only); the new columns inherit that automatically.
