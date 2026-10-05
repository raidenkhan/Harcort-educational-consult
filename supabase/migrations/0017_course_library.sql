-- ============================================================================
-- Harcourt — 0017 · Course library (materials + tutorial videos)
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- Gives every course a home for its downloadable materials and tutorial
-- videos, so the public /courses/[id] page renders real content instead of a
-- placeholder. Mirrors the `courses` table's access model: public read,
-- admin-only writes.
--
-- The browser never touches the database (everything runs through the
-- server-only service-role client), so these policies are defence in depth —
-- the app layer is the real authorization boundary.
--
-- `category` and `file_format` are plain text on purpose: the allowlists live
-- in services/courses/schemas.ts (Zod). A Postgres enum would force a
-- separate migration + transaction to add one value later (ALTER TYPE … ADD
-- VALUE cannot run in the same transaction as statements that use it).
-- ============================================================================

create table if not exists public.course_materials (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  title       text not null,
  category    text not null,
  file_format text not null default 'PDF',
  file_url    text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table if not exists public.course_videos (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses (id) on delete cascade,
  provider    text not null default 'youtube',
  video_id    text not null,
  title       text not null,
  topic       text,
  duration    text,
  description text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists course_materials_course_idx
  on public.course_materials (course_id, created_at desc);

create index if not exists course_videos_course_idx
  on public.course_videos (course_id, sort_order, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.course_materials enable row level security;
alter table public.course_videos    enable row level security;

-- --- course_materials -------------------------------------------------------
drop policy if exists "read course materials" on public.course_materials;
create policy "read course materials" on public.course_materials for select
  using (true);

drop policy if exists "admin manage course materials" on public.course_materials;
create policy "admin manage course materials" on public.course_materials for all
  using (public.is_admin()) with check (public.is_admin());

-- --- course_videos ----------------------------------------------------------
drop policy if exists "read course videos" on public.course_videos;
create policy "read course videos" on public.course_videos for select
  using (true);

drop policy if exists "admin manage course videos" on public.course_videos;
create policy "admin manage course videos" on public.course_videos for all
  using (public.is_admin()) with check (public.is_admin());
