-- ============================================================================
-- Harcourt Educational Consult — 0013: reports moderation
--
-- Adds resolver accountability columns to `reports` (created in 0001):
--   resolved_at, resolved_by (→ profiles), resolution_note.
-- Which admin resolved what is also written to admin_audit_log by the app
 -- layer at resolve time; these columns make the reports table itself
-- self-describing for support queries.
--
-- Safe to re-run: guarded ALTERs, no data changes.
-- ============================================================================

alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.reports add column if not exists resolved_by uuid references public.profiles (id);
alter table public.reports add column if not exists resolution_note text;

-- Reports mostly get fetched by status (the admin queue) — mirror the
-- conversation index pattern.
create index if not exists idx_reports_status on public.reports (status, created_at);
