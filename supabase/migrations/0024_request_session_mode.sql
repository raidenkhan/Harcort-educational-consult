-- ============================================================================
-- Harcourt Educational Consult — 0024: session format is per request
--
-- 0021 put `session_mode` on `profiles`, which made the format a single
-- global preference: choosing "group" for one tutor silently changed every
-- other tutor's request too. Students don't work that way — one engagement
-- may be a group tutorial and the next one-on-one.
--
-- The format now lives on `tutor_requests`, which is exactly the unit that
-- has a tutor, a course and a price. Nothing is shown at sign-up or on the
-- dashboard; it is asked once, inside the request dialog, and it only
-- applies to that request.
--
-- `profiles.session_mode` is left in place (existing rows keep their value)
-- but is no longer written or read: the app treats it as legacy.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Per-request column
-- ---------------------------------------------------------------------------

alter table public.tutor_requests
  add column if not exists session_mode text not null default 'one_on_one';

alter table public.tutor_requests
  drop constraint if exists tutor_requests_session_mode_check;
alter table public.tutor_requests
  add constraint tutor_requests_session_mode_check
  check (session_mode in ('one_on_one', 'group'));

create index if not exists idx_tutor_requests_session_mode
  on public.tutor_requests (session_mode);

-- ---------------------------------------------------------------------------
-- 2) send_tutor_request gains the format
--
-- The old 4-argument signature is dropped instead of left as an overload:
-- PostgREST resolves named arguments, and two functions that both accept
-- (actor_id, p_tutor_profile_id, p_course_id, p_message) would be ambiguous
-- for a call that omits the new parameter.
-- ---------------------------------------------------------------------------

drop function if exists public.send_tutor_request(uuid, uuid, uuid, text);

create or replace function public.send_tutor_request(
  actor_id            uuid,
  p_tutor_profile_id  uuid,
  p_course_id         uuid default null,
  p_message           text default '',
  p_session_mode      text default 'one_on_one'
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_role   text;
  v_request_id   uuid;
  v_tutor        record;
  v_msg          text := left(coalesce(p_message, ''), 500);
  v_mode         text := case when p_session_mode = 'group' then 'group' else 'one_on_one' end;
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

  -- Idempotent: an existing pending request for this pair just returns. The
  -- student can still change the format of that request with
  -- update_tutor_request_session below.
  select id into v_request_id
    from public.tutor_requests
    where student_id = actor_id
      and tutor_profile_id = p_tutor_profile_id
      and status = 'pending'
    limit 1;
  if v_request_id is not null then
    return v_request_id;
  end if;

  insert into public.tutor_requests
    (student_id, tutor_profile_id, course_id, message, session_mode)
  values (actor_id, p_tutor_profile_id, p_course_id, v_msg, v_mode)
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

-- ---------------------------------------------------------------------------
-- 3) The student can change the format of a request still waiting on the tutor
--
-- The request dialog is the only place this is asked, so re-opening it for an
-- already-pending request has to be able to update the answer instead of
-- silently returning the old one.
-- ---------------------------------------------------------------------------

create or replace function public.update_tutor_request_session(
  actor_id       uuid,
  p_request_id   uuid,
  p_session_mode text
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request record;
  v_mode    text := case when p_session_mode = 'group' then 'group' else 'one_on_one' end;
begin
  select * into v_request
    from public.tutor_requests
    where id = p_request_id
    for update;

  if v_request.id is null then
    raise exception 'request_not_found';
  end if;
  if v_request.student_id <> actor_id then
    raise exception 'forbidden: not your request';
  end if;

  update public.tutor_requests
    set session_mode = v_mode,
        updated_at = now()
    where id = p_request_id;
end;
$$;

comment on column public.tutor_requests.session_mode is
  'Session format for THIS request (one_on_one | group). Per tutor+course, not a global student preference (0024).';
