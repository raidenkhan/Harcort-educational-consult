-- ============================================================================
-- Harcourt — 0023 · Study groups
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- A study group is a course-scoped room a tutor runs for their students.
-- Students join by sharing the short `join_code`; everyone in the group sees
-- a shared message feed (WhatsApp-style). `is_archived` is a soft-delete so
-- the owner's audit trail — and the group's messages — survives.
--
-- Like every other private table here (credentials, sessions, tutoring
-- sessions), these are DENY-ALL for the anon/authenticated keys: no policies
-- at all. All access goes through the server-only service-role client, which
-- bypasses RLS and enforces membership in the service layer (the app layer is
-- the real authorization boundary).
-- ============================================================================

create table if not exists public.study_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  course_id   uuid references public.courses (id) on delete set null,
  description text,
  join_code   text not null unique,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint study_groups_name_len check (char_length(name) between 1 and 80)
);

create table if not exists public.study_group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member'
             check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  unique (group_id, profile_id)
);

create table if not exists public.study_group_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.study_groups (id) on delete cascade,
  sender_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint study_group_messages_body_len check (char_length(body) between 1 and 2000)
);

create index if not exists study_groups_created_by_idx
  on public.study_groups (created_by, is_archived, created_at desc);

create index if not exists study_group_members_profile_idx
  on public.study_group_members (profile_id, joined_at desc);

create index if not exists study_group_messages_group_idx
  on public.study_group_messages (group_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security — deny-all (no policies on purpose).
-- ---------------------------------------------------------------------------
alter table public.study_groups         enable row level security;
alter table public.study_group_members  enable row level security;
alter table public.study_group_messages enable row level security;
