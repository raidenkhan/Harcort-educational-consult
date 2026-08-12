-- ============================================================================
-- Harcourt Educational Consult — Phase: admin-issued password reset codes
-- Apply in: Supabase Dashboard → SQL Editor (paste & run)
--
-- Email-based recovery is unavailable (Supabase auth email rate limits), so
-- admins issue one-time reset codes that are shared out-of-band (WhatsApp /
-- phone). Codes are stored SHA-256-hashed (same discipline as `sessions`),
-- single-use, expire after 30 minutes, and redeeming one revokes every
-- existing session for that user.
--
-- RLS: deny-all (no policies) — the app layer (service-role client with
-- explicit checks) is the authorization boundary, exactly like
-- `credentials` and `sessions`.
-- ============================================================================

create table if not exists public.password_resets (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  code_hash   text not null,                -- sha256 hex of the plaintext code
  expires_at  timestamptz not null,
  used_at     timestamptz,                  -- set when redeemed (single-use)
  created_by  uuid references public.profiles (id),  -- admin who issued it
  created_at  timestamptz not null default now()
);

create index if not exists idx_password_resets_profile
  on public.password_resets (profile_id, created_at desc);

alter table public.password_resets enable row level security;
