-- ============================================================================
-- Harcot Educational Consult — Phase 0 schema
-- Apply in: Supabase Dashboard → SQL Editor (paste & run), or with the
-- Supabase CLI:  supabase db push
-- NOTE: Run ONCE per environment (standard migration semantics).
--
-- What this gives you:
--   1. Full data model (profiles, tutors, courses, services, chat, audit)
--   2. Row Level Security so the DATABASE enforces who can see/do what
--   3. Auto-created profiles + role claims on signup (JWT 'role' claim)
--   4. Atomic admin approve/reject RPCs with an immutable audit trail
--   5. Realtime publication on chat tables (Phase 2)
--   6. Seed subject/course taxonomy
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('student', 'tutor', 'admin');
create type public.tutor_status as enum ('pending', 'approved', 'rejected');
create type public.conversation_status as enum ('open', 'closed');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null default '',
  role       public.user_role not null default 'student',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  subject     text not null,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  unique (subject, name)
);

create table public.tutor_profiles (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  bio                 text,
  qualifications      text,
  rate_per_hour       numeric(10, 2) check (rate_per_hour >= 0),
  verification_status public.tutor_status not null default 'pending',
  admin_notes         text,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.tutor_services (
  id               uuid primary key default gen_random_uuid(),
  tutor_profile_id uuid not null references public.tutor_profiles (id) on delete cascade,
  course_id        uuid not null references public.courses (id) on delete cascade,
  price            numeric(10, 2) not null check (price >= 0),
  description      text,
  created_at       timestamptz not null default now()
);

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles (id) on delete cascade,
  tutor_profile_id uuid not null references public.tutor_profiles (id) on delete cascade,
  status           public.conversation_status not null default 'open',
  created_at       timestamptz not null default now(),
  unique (student_id, tutor_profile_id)
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table public.admin_audit_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid references public.profiles (id),
  action      text not null,
  target_type text not null,
  target_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null,
  target_id   uuid not null,
  reason      text,
  status      public.report_status not null default 'open',
  created_at  timestamptz not null default now()
);

-- Indexes for the hot query paths
create index idx_tutor_profiles_status on public.tutor_profiles (verification_status);
create index idx_tutor_services_course on public.tutor_services (course_id);
create index idx_conversations_student on public.conversations (student_id);
create index idx_messages_conversation on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
-- True when the caller's JWT carries the admin role claim (set on signup).
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'role') = 'admin', false);
$$;

-- True when the caller is a member (student or tutor) of a conversation.
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conv_id
      and (
        c.student_id = auth.uid()
        or c.tutor_profile_id in (
          select tp.id from public.tutor_profiles tp
          where tp.profile_id = auth.uid()
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-create profile + stamp role claim on user signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  desired_role text := coalesce(new.raw_user_meta_data ->> 'role', 'student');
begin
  -- Never allow self-registration as admin; reject unknown roles.
  if desired_role not in ('student', 'tutor') then
    desired_role := 'student';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    desired_role::public.user_role
  );

  -- Stamp the role into app_metadata so the JWT carries it for RLS.
  update auth.users
  set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', desired_role)
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Admin RPCs — atomic approve/reject + immutable audit trail
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_tutor(target_id uuid, note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only';
  end if;

  update public.tutor_profiles
  set verification_status = 'approved',
      admin_notes         = note,
      reviewed_at         = now(),
      updated_at          = now()
  where id = target_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'approve_tutor', 'tutor_profile', target_id,
          jsonb_build_object('note', note));
end;
$$;

create or replace function public.admin_reject_tutor(target_id uuid, note text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only';
  end if;

  update public.tutor_profiles
  set verification_status = 'rejected',
      admin_notes         = note,
      reviewed_at         = now(),
      updated_at          = now()
  where id = target_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'reject_tutor', 'tutor_profile', target_id,
          jsonb_build_object('note', note));
end;
$$;

-- ---------------------------------------------------------------------------
-- Status guard — tutors must never be able to change their own
-- verification_status. RLS policies cannot reference `old` inside WITH CHECK,
-- so this is enforced with a BEFORE UPDATE trigger instead.
-- ---------------------------------------------------------------------------
create or replace function public.tutor_profile_status_guard()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.verification_status is distinct from old.verification_status
     and not public.is_admin() then
    raise exception 'forbidden: only admins may change verification status';
  end if;
  return new;
end;
$$;

drop trigger if exists tutor_profile_status_guard on public.tutor_profiles;
create trigger tutor_profile_status_guard
  before update on public.tutor_profiles
  for each row execute function public.tutor_profile_status_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.courses         enable row level security;
alter table public.tutor_profiles  enable row level security;
alter table public.tutor_services  enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.reports         enable row level security;

-- --- profiles --------------------------------------------------------------
create policy "read own profile" on public.profiles for select
  using (auth.uid() = id);

create policy "read profiles of approved tutors" on public.profiles for select
  using (exists (
    select 1 from public.tutor_profiles tp
    where tp.profile_id = profiles.id
      and tp.verification_status = 'approved'
  ));

create policy "update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "admin manage profiles" on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- --- courses (public read; admin manages) -----------------------------------
create policy "read courses" on public.courses for select using (true);

create policy "admin manage courses" on public.courses for all
  using (public.is_admin()) with check (public.is_admin());

-- --- tutor_profiles ----------------------------------------------------------
create policy "read approved tutor profiles" on public.tutor_profiles for select
  using (verification_status = 'approved');

create policy "read own tutor profile" on public.tutor_profiles for select
  using (profile_id = auth.uid());

create policy "create own tutor profile" on public.tutor_profiles for insert
  with check (profile_id = auth.uid() and verification_status = 'pending');

create policy "update own tutor profile" on public.tutor_profiles for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
-- (Changing verification_status is blocked by the
--  tutor_profile_status_guard trigger — see below.)

create policy "admin manage tutor profiles" on public.tutor_profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- --- tutor_services ----------------------------------------------------------
create policy "read services of approved tutors" on public.tutor_services for select
  using (exists (
    select 1 from public.tutor_profiles tp
    where tp.id = tutor_services.tutor_profile_id
      and tp.verification_status = 'approved'
  ));

create policy "owner manage own services" on public.tutor_services for all
  using (exists (
    select 1 from public.tutor_profiles tp
    where tp.id = tutor_services.tutor_profile_id
      and tp.profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.tutor_profiles tp
    where tp.id = tutor_services.tutor_profile_id
      and tp.profile_id = auth.uid()
  ));

create policy "admin manage tutor services" on public.tutor_services for all
  using (public.is_admin()) with check (public.is_admin());

-- --- conversations -----------------------------------------------------------
create policy "read own conversations" on public.conversations for select
  using (public.is_conversation_member(id));

create policy "start conversation as student" on public.conversations for insert
  with check (auth.uid() = student_id);

create policy "admin manage conversations" on public.conversations for all
  using (public.is_admin()) with check (public.is_admin());

-- --- messages ----------------------------------------------------------------
create policy "read conversation messages" on public.messages for select
  using (public.is_conversation_member(conversation_id));

create policy "send conversation messages" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

create policy "admin manage messages" on public.messages for all
  using (public.is_admin()) with check (public.is_admin());

-- --- admin_audit_log (admin-only, append-mostly) ------------------------------
create policy "admin read audit log" on public.admin_audit_log for select
  using (public.is_admin());

create policy "admin write audit log" on public.admin_audit_log for insert
  with check (public.is_admin());

-- --- reports ------------------------------------------------------------------
create policy "file report" on public.reports for insert
  with check (auth.uid() = reporter_id);

create policy "admin manage reports" on public.reports for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime (Phase 2 chat uses this) — idempotent so the migration can be
-- re-run safely if the publication already has the tables.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Seed course taxonomy
-- ---------------------------------------------------------------------------
insert into public.courses (subject, name, description) values
  ('Mathematics',   'Algebra',               'Algebraic expressions, equations and inequalities'),
  ('Mathematics',   'Calculus',              'Limits, derivatives and integrals'),
  ('Mathematics',   'Statistics',            'Descriptive and inferential statistics'),
  ('Mathematics',   'Further Mathematics',   'Advanced topics for high achievers'),
  ('English',       'Essay Writing',         'Structuring and writing compelling essays'),
  ('English',       'Literature',            'Prose, poetry and drama analysis'),
  ('English',       'Grammar & Composition', 'Foundations of clear, correct writing'),
  ('Sciences',      'Physics',               'Mechanics, waves, electricity and magnetism'),
  ('Sciences',      'Chemistry',             'Atomic structure, reactions and organic chemistry'),
  ('Sciences',      'Biology',               'Cell biology, genetics and ecology'),
  ('Computer Science', 'Programming Fundamentals', 'Logic, loops and building your first programs'),
  ('Computer Science', 'Web Development',    'HTML, CSS, JavaScript and modern frameworks'),
  ('Business',      'Economics',             'Micro and macroeconomics, markets and policy'),
  ('Business',      'Accounting',            'Financial accounting and reporting'),
  ('Languages',     'French',                'Speaking, reading and writing French'),
  ('Languages',     'Spanish',               'Speaking, reading and writing Spanish'),
  ('Exam Prep',     'Common Entrance',       'Preparation for entrance examinations'),
  ('Exam Prep',     'WAEC / NECO',           'Focused revision for WASSCE and NECO')
on conflict (subject, name) do nothing;
