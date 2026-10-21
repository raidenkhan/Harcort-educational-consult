-- ============================================================================
-- Harcourt Educational Consult — 0025: first-party page views
--
-- The admin Performance tab needs site traffic (views, visitors, top pages,
-- referrers). Rather than embed a third-party script, the app records its own
-- page views here — same origin, no new account, nothing to configure, and it
-- works under the existing `default-src 'self'` CSP.
--
-- Privacy, by design:
--   * No IP address, no user agent, no query string is stored.
--   * `visitor_hash` is sha256(random first-party cookie + ANALYTICS_SALT), so
--     it can count unique visitors across a day but can't be reversed to a
--     person. The cookie is set by /api/track only.
--   * Admin routes and API routes are never recorded.
--   * Do-Not-Track requests are not recorded (the client checks the header).
--
-- RLS: deny-all (no policies) — the service-role client is the only reader,
-- and the admin page gates on requireRole("admin").
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

create table if not exists public.page_views (
  id           bigint generated always as identity primary key,
  path         text not null check (char_length(path) between 1 and 300),
  -- Hostname only ("google.com"), never the full referring URL.
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  -- Opaque per-browser hash; not a person identifier.
  visitor_hash text not null check (char_length(visitor_hash) = 64),
  created_at   timestamptz not null default now()
);

-- The time-window scans behind every traffic number.
create index if not exists idx_page_views_created on public.page_views (created_at desc);
-- Top-pages grouping.
create index if not exists idx_page_views_path on public.page_views (path, created_at desc);

alter table public.page_views enable row level security;
-- (No policies on purpose.)

comment on table public.page_views is
  'First-party traffic log for the admin Performance tab (0025). No IPs, no user agents, no query strings.';
