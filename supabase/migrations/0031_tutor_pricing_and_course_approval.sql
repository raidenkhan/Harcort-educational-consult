-- ============================================================================
-- Harcourt — 0031 Per-mode course pricing + tutor-added courses
--
-- Two changes, both driven by how tutoring actually works at Harcourt:
--
--   1. PRICE BY FORMAT. A tutor charges differently for a group session than
--      for one-on-one. `tutor_services` had a single `price`, so every
--      offering collapsed to one number. It now carries `price_group` and
--      `price_one_on_one`, matching `tutor_requests.session_mode` (0024).
--      Either may be NULL — NULL means "I don't offer this course in that
--      format", and the request UI will not let a student pick it. The old
--      `price` column is kept (and still written by the app as the
--      one-on-one price) so a deploy that lands before this migration keeps
--      working; readers prefer the per-mode columns and fall back to `price`.
--
--   2. TUTOR-ADDED COURSES. The catalog is seeded from the department's own
--      published curriculum, but it will always lag reality (a new elective,
--      a course the published tables missed). A tutor can now add the course
--      they actually teach — course code REQUIRED — and it is created
--      UNPUBLISHED (`is_approved = false`) so the public /courses directory
--      only ever shows catalog rows an admin has vetted. The tutor can price
--      and teach their own pending course immediately.
--
-- Course codes are normalized to upper case with single spaces ("me 158" ->
-- "ME 158") and deduped per programme, so a tutor adding a course that
-- already exists re-uses the existing row instead of creating a twin. 0026
-- already put a unique index on (subject, code); this migration adds the
-- case-insensitive twin of it, after normalizing existing data.
--
-- Apply: Supabase Dashboard -> SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Per-format pricing on tutor_services
-- ---------------------------------------------------------------------------

alter table public.tutor_services add column if not exists price_group numeric(10, 2);
alter table public.tutor_services add column if not exists price_one_on_one numeric(10, 2);

-- Existing rows had ONE price that applied to whichever format the student
-- picked (the format was chosen per request, never priced), so it becomes the
-- price for BOTH formats. That keeps every live group request payable; a
-- tutor then narrows it from their dashboard by clearing one of the two.
update public.tutor_services
set price_one_on_one = coalesce(price_one_on_one, price),
    price_group     = coalesce(price_group, price)
where price is not null;

alter table public.tutor_services drop constraint if exists tutor_services_price_group_check;
alter table public.tutor_services add constraint tutor_services_price_group_check
  check (price_group is null or price_group >= 0);

alter table public.tutor_services drop constraint if exists tutor_services_price_one_on_one_check;
alter table public.tutor_services add constraint tutor_services_price_one_on_one_check
  check (price_one_on_one is null or price_one_on_one >= 0);

-- An offering with no price at all is meaningless: it would render as a
-- course the tutor "teaches" for free, and the paywall would compute GH₵0.
-- Guard it here as well as in the Zod schema, because the admin console and
-- any future import write to this table too.
alter table public.tutor_services drop constraint if exists tutor_services_price_any_check;
alter table public.tutor_services add constraint tutor_services_price_any_check
  check (price_group is not null or price_one_on_one is not null);

-- The request/paywall reads look up one tutor's offering for one course.
create index if not exists idx_tutor_services_tutor_course
  on public.tutor_services (tutor_profile_id, course_id);

comment on column public.tutor_services.price_group is
  'Per-student fee (GH₵) when the student chose a group session. NULL = not offered in this format.';
comment on column public.tutor_services.price_one_on_one is
  'Per-student fee (GH₵) for one-on-one sessions. NULL = not offered in this format.';
comment on column public.tutor_services.price is
  'LEGACY single price (pre-0031). Written as the one-on-one price so a deploy before 0031 still works. Readers should use price_one_on_one / price_group.';

-- ---------------------------------------------------------------------------
-- 2. Tutor-added courses, held for admin approval
-- ---------------------------------------------------------------------------

alter table public.courses add column if not exists created_by_profile_id uuid
  references public.profiles (id) on delete set null;

-- Default TRUE so every existing (seeded) catalog row stays published.
alter table public.courses add column if not exists is_approved boolean not null default true;

create index if not exists idx_courses_pending
  on public.courses (created_at desc)
  where is_approved = false;

comment on column public.courses.created_by_profile_id is
  'Set when a tutor added this course from their dashboard. NULL = seeded/curated catalog row.';
comment on column public.courses.is_approved is
  'FALSE = added by a tutor, hidden from the public directory until an admin approves it.';

-- Normalize codes: trim, collapse inner whitespace, upper-case.
update public.courses
set code = upper(trim(regexp_replace(code, '\s+', ' ', 'g')))
where code is not null
  and code <> upper(trim(regexp_replace(code, '\s+', ' ', 'g')));

-- If the same code somehow names two rows in one programme, keep the code on
-- the oldest and blank it on the others (the rows themselves survive, so no
-- tutor's offering is orphaned). 0030's data has no such pair; this is here
-- for databases still carrying 0026's invented codes.
update public.courses c
set code = null
where c.code is not null
  and exists (
    select 1
    from public.courses k
    where k.subject = c.subject
      and upper(k.code) = upper(c.code)
      and k.id <> c.id
      and (k.created_at, k.id) < (c.created_at, c.id)
  );

-- 0026's index is case-SENSITIVE, so "me 158" and "ME 158" could both exist.
create unique index if not exists idx_courses_subject_code_ci
  on public.courses (subject, upper(code))
  where code is not null;

-- ---------------------------------------------------------------------------
-- 3. The engagement must be priced in the format the student chose
-- ---------------------------------------------------------------------------

-- 0029 priced every engagement from the single `price`. With two prices that
-- would silently charge one format's fee for the other. The format is the
-- REQUEST's `session_mode` (0024) — it is per tutor+course, so it cannot be
-- read off the student's profile.
--
-- A format the tutor does not offer (NULL price) RAISES instead of falling
-- back: charging the other format's fee is the one failure mode we cannot
-- allow, because the student would be billed a number they never agreed to.
create or replace function public.create_payment_engagement(
  actor_id           uuid,
  p_student_id       uuid,
  p_tutor_service_id uuid,
  p_request_id       uuid default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_service       record;
  v_engagement_id uuid;
  v_total         bigint;
  v_actor_role    text;
  v_mode          text;
  v_price         numeric(10, 2);
begin
  if actor_id is null then
    raise exception 'forbidden: actor required';
  end if;

  if actor_id <> p_student_id and not public.is_admin(actor_id) then
    raise exception 'forbidden: only the student or an admin can create an engagement';
  end if;

  select ts.id, ts.price, ts.price_group, ts.price_one_on_one, ts.course_id,
         tp.id as tutor_profile_id, tp.verification_status,
         p.role as tutor_role
    into v_service
    from public.tutor_services ts
    join public.tutor_profiles tp on tp.id = ts.tutor_profile_id
    join public.profiles p on p.id = tp.profile_id
    where ts.id = p_tutor_service_id
    limit 1;

  if v_service.id is null then
    raise exception 'service_not_found';
  end if;
  if v_service.verification_status <> 'approved' or v_service.tutor_role = 'student' then
    raise exception 'service_not_available';
  end if;

  -- The format this payment is for: the named request first, then the
  -- student's live request for the same tutor+course (the dashboard "Pay"
  -- button does not carry a request id), then the default.
  if p_request_id is not null then
    select tr.session_mode into v_mode
      from public.tutor_requests tr
     where tr.id = p_request_id
       and tr.student_id = p_student_id
       and tr.tutor_profile_id = v_service.tutor_profile_id
       and tr.course_id is not distinct from v_service.course_id;
  end if;

  if v_mode is null then
    select tr.session_mode into v_mode
      from public.tutor_requests tr
     where tr.student_id = p_student_id
       and tr.tutor_profile_id = v_service.tutor_profile_id
       and tr.course_id is not distinct from v_service.course_id
       and tr.status in ('pending', 'accepted')
     order by tr.created_at desc
     limit 1;
  end if;

  v_mode := coalesce(v_mode, 'one_on_one');

  if v_mode = 'group' then
    v_price := v_service.price_group;
  else
    v_price := v_service.price_one_on_one;
  end if;

  -- NULL = "this tutor does not teach this course in that format". Never
  -- substitute the other format's price.
  if v_price is null then
    raise exception 'format_not_offered: %', v_mode;
  end if;
  if v_price < 0 then
    raise exception 'invalid_price';
  end if;

  if actor_id <> p_student_id then v_actor_role := 'admin'; else v_actor_role := 'student'; end if;

  -- Price snapshot: the tutor's quote for THIS format converts to pesewas ONCE
  -- (0029: the FULL semester fee — one installment, due within the commitment
  -- window).
  v_total := round(v_price * 100)::bigint;

  insert into public.engagements (
    student_id, tutor_profile_id, course_id, tutor_service_id, agreed_total, status
  ) values (
    p_student_id, v_service.tutor_profile_id, v_service.course_id,
    v_service.id, v_total, 'pending_payment'
  )
  on conflict do nothing
  returning id into v_engagement_id;

  if v_engagement_id is null then
    raise exception 'engagement_exists';
  end if;

  insert into public.installments (engagement_id, idx, amount, due_at, paid_amount)
  values (v_engagement_id, 1, v_total, now() + interval '3 days', 0);

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_engagement_id, 'engagement.created', actor_id, v_actor_role, 'app',
          jsonb_build_object('agreed_total', v_total,
                             'plan', 'full_upfront',
                             'session_mode', v_mode,
                             'course_id', v_service.course_id,
                             'request_id', p_request_id));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.engagement_created', 'tutor', (select profile_id from public.tutor_profiles where id = v_service.tutor_profile_id), v_engagement_id, '{}'::jsonb),
    ('payment.engagement_created', 'admin', null, v_engagement_id, '{}'::jsonb);

  return v_engagement_id;
end;
$$;
