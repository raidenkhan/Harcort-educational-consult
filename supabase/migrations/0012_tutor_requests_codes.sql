-- ============================================================================
-- Harcourt Educational Consult — 0012: tutor requests, public tracking codes
--
-- Three capabilities, one migration:
--
--   1. PUBLIC TRACKING CODES — profiles gains public_code (HC-S-XXXXXX for
--      students, HC-T-XXXXXX for tutors): a short human-quotable id for
--      support/WhatsApp conversations and payment reconciliation. The uuid
--      PKs stay authoritative; the code is a display/reconciliation layer.
--      Alphabet excludes 0/O/1/I so codes survive being read aloud over a
--      phone call. Assigned by trigger at insert, backfilled for existing
--      rows, unique.
--
--   2. TUTOR REQUESTS — the structured first step between "student found a
--      tutor" and "sessions get scheduled". A student sends a request
--      (optionally naming the course + a note); the tutor ACCEPTS or
--      DECLINES from their inbox. Acceptance is what unlocks the pay-50%
--      path (request-first, pay-after-acceptance — the decided flow).
--      Chat stays open independently: a request is a commitment signal,
--      not a chat gate.
--
--   3. RPC GUARDS — send (student-only, tutor must be approved, one pending
--      per pair), respond (tutor-only owner), withdraw (student-only owner).
--      Notifications enqueue into notification_outbox in-transaction, same
--      as the payments flow.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- RLS: deny-all (no policies) — service-role client + RPCs only.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Public tracking codes
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists public_code text;

create unique index if not exists idx_profiles_public_code
  on public.profiles (public_code)
  where public_code is not null;

-- Backfill: every existing profile gets an unambiguous 6-char code.
do $$
declare
  r record;
  candidate text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  ok boolean;
begin
  for r in select id, role from public.profiles where public_code is null loop
    loop
      candidate := 'HC-' || case when r.role = 'tutor' then 'T-' else 'S-' end;
      for i in 1..6 loop
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      exit when true;
    end loop;
    -- Retry on the (astronomically unlikely) collision.
    begin
      update public.profiles set public_code = candidate where id = r.id;
    exception when unique_violation then
      begin
        candidate := substr(candidate, 1, 8) ||
          substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
        update public.profiles set public_code = candidate where id = r.id;
      exception when unique_violation then
        raise;
      end;
    end;
  end loop;
end $$;

-- New rows get a code automatically. Prefix reflects the signup role;
-- a later role switch keeps the code (uniqueness is what matters).
create or replace function public.assign_public_code()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
begin
  if new.public_code is not null then
    return new;
  end if;
  loop
    candidate := 'HC-' || case when new.role = 'tutor' then 'T-' else 'S-' end;
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      perform 1 from public.profiles where public_code = candidate limit 1;
      exit when not found;
    end;
  end loop;
  new.public_code := candidate;
  return new;
end;
$$;

drop trigger if exists trg_assign_public_code on public.profiles;
create trigger trg_assign_public_code
  before insert on public.profiles
  for each row execute function public.assign_public_code();

-- ---------------------------------------------------------------------------
-- 2) Tutor requests
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.tutor_request_status as enum
    ('pending', 'accepted', 'declined', 'withdrawn');
exception when duplicate_object then null; end $$;

create table if not exists public.tutor_requests (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.profiles (id) on delete cascade,
  tutor_profile_id uuid not null references public.tutor_profiles (id) on delete cascade,
  course_id        uuid references public.courses (id) on delete set null,
  message          text not null default '' check (char_length(message) <= 500),
  status           public.tutor_request_status not null default 'pending',
  responded_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One PENDING request per (student, tutor) — re-applying after a decline
-- inserts a fresh row (history preserved), duplicates don't pile up.
create unique index if not exists idx_tutor_requests_open
  on public.tutor_requests (student_id, tutor_profile_id)
  where status = 'pending';

create index if not exists idx_tutor_requests_inbox
  on public.tutor_requests (tutor_profile_id, status, created_at desc);
create index if not exists idx_tutor_requests_student
  on public.tutor_requests (student_id, created_at desc);

alter table public.tutor_requests enable row level security;
-- (No policies on purpose.)

-- ---------------------------------------------------------------------------
-- 3) Request RPCs
-- ---------------------------------------------------------------------------

-- send_tutor_request — a student asks a tutor for structured help. The
-- tutor must be approved; a duplicate pending request returns the existing
-- id (idempotent). Enqueues the tutor's inbox notification in-transaction.
create or replace function public.send_tutor_request(
  actor_id            uuid,
  p_tutor_profile_id  uuid,
  p_course_id         uuid default null,
  p_message           text default ''
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_role   text;
  v_request_id   uuid;
  v_tutor        record;
  v_msg          text := left(coalesce(p_message, ''), 500);
begin
  if actor_id is null then
    raise exception 'forbidden: actor required';
  end if;

  select role into v_actor_role from public.profiles where id = actor_id;
  if v_actor_role is null then
    raise exception 'forbidden: unknown actor';
  end if;
  if v_actor_role <> 'student' then
    raise exception 'forbidden: students only';
  end if;

  select tp.id, tp.verification_status, p.id as tutor_user_id
    into v_tutor
    from public.tutor_profiles tp
    join public.profiles p on p.id = tp.profile_id
    where tp.id = p_tutor_profile_id
    limit 1;
  if v_tutor.id is null or v_tutor.verification_status <> 'approved' then
    raise exception 'tutor_not_available';
  end if;

  -- Idempotent: an existing pending request for this pair just returns.
  select id into v_request_id
    from public.tutor_requests
    where student_id = actor_id
      and tutor_profile_id = p_tutor_profile_id
      and status = 'pending'
    limit 1;
  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.tutor_requests (student_id, tutor_profile_id, course_id, message)
  values (actor_id, p_tutor_profile_id, p_course_id, v_msg)
  on conflict (student_id, tutor_profile_id) where status = 'pending' do nothing
  returning id into v_request_id;

  -- Lost a race? Re-read the winner's row.
  if v_request_id is null then
    select id into v_request_id
      from public.tutor_requests
      where student_id = actor_id
        and tutor_profile_id = p_tutor_profile_id
        and status = 'pending'
      limit 1;
  end if;

  insert into public.notification_outbox (type, audience, recipient_id, data)
  values ('request.received', 'tutor', v_tutor.tutor_user_id,
          jsonb_build_object('request_id', v_request_id));

  return v_request_id;
end;
$$;

-- respond_tutor_request — the tutor accepts or declines. Only the request's
-- own tutor, only while pending. Acceptance enqueues the student's
-- "you're accepted — complete your first 50% to activate sessions" email.
create or replace function public.respond_tutor_request(
  actor_id      uuid,
  p_request_id  uuid,
  p_accept      boolean
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request record;
begin
  if actor_id is null then
    raise exception 'forbidden: actor required';
  end if;

  select r.*, tp.profile_id as tutor_user_id
    into v_request
    from public.tutor_requests r
    join public.tutor_profiles tp on tp.id = r.tutor_profile_id
    where r.id = p_request_id
    for update of r;

  if v_request.id is null then
    raise exception 'request_not_found';
  end if;
  if v_request.tutor_user_id <> actor_id then
    raise exception 'forbidden: not this request''s tutor';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'request_not_pending: status %', v_request.status;
  end if;

  update public.tutor_requests
    set status = case when p_accept then 'accepted' else 'declined' end,
        responded_at = now(),
        updated_at = now()
    where id = p_request_id;

  insert into public.notification_outbox (type, audience, recipient_id, data)
  values (
    case when p_accept then 'request.accepted' else 'request.declined' end,
    'student', v_request.student_id,
    jsonb_build_object('request_id', p_request_id)
  );
end;
$$;

-- withdraw_tutor_request — the student pulls their own pending request.
create or replace function public.withdraw_tutor_request(
  actor_id      uuid,
  p_request_id  uuid
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request record;
begin
  select * into v_request from public.tutor_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'request_not_found';
  end if;
  if v_request.student_id <> actor_id then
    raise exception 'forbidden: not your request';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'request_not_pending: status %', v_request.status;
  end if;

  update public.tutor_requests
    set status = 'withdrawn', responded_at = now(), updated_at = now()
    where id = p_request_id;
end;
$$;
