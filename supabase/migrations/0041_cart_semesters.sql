-- ============================================================================
-- Harcourt — 0041 · Book several semesters in one checkout
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
-- Requires 0040 (cart checkout).
--
-- The tutor card's "Book tutor" dialog lets a student tick courses AND choose
-- how many semesters of tutoring they want. Prices stay PER SEMESTER (every
-- tutor price, every label); the agreement for a course is simply
--
--     agreed_total = semester price (for the chosen format) × semesters
--
-- and that multiplication happens HERE, on the server, from tutor_services —
-- the browser only says "3 semesters", it never says what that costs.
--
--   1. `engagements.semesters` (1..4, default 1) records what was bought, so
--      receipts, dashboards and admins can show "× 3 semesters".
--   2. `prepare_cart_engagement` gains `p_semesters` (default 1). The old
--      4-argument version is DROPPED first: leaving both would make PostgREST
--      calls ambiguous. Every existing caller that omits p_semesters keeps
--      getting the single-semester price.
-- ============================================================================

alter table public.engagements
  add column if not exists semesters smallint not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'engagements_semesters_range'
  ) then
    alter table public.engagements
      add constraint engagements_semesters_range check (semesters between 1 and 4);
  end if;
end $$;

drop function if exists public.prepare_cart_engagement(uuid, uuid, uuid, text);

create or replace function public.prepare_cart_engagement(
  actor_id           uuid,
  p_student_id       uuid,
  p_tutor_service_id uuid,
  p_session_mode     text default 'one_on_one',
  p_semesters        integer default 1
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_service    record;
  v_engagement record;
  v_id         uuid;
  v_mode       text;
  v_semesters  integer;
  v_price      numeric(10, 2);
  v_total      bigint;
begin
  if actor_id is null then
    raise exception 'forbidden: actor required';
  end if;
  if actor_id <> p_student_id and not public.is_admin(actor_id) then
    raise exception 'forbidden: only the student or an admin can prepare a cart';
  end if;

  v_mode := coalesce(nullif(btrim(p_session_mode), ''), 'one_on_one');
  if v_mode not in ('one_on_one', 'group') then
    raise exception 'invalid_session_mode: %', v_mode;
  end if;

  v_semesters := coalesce(p_semesters, 1);
  if v_semesters < 1 or v_semesters > 4 then
    raise exception 'invalid_semesters: %', v_semesters;
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

  if v_mode = 'group' then
    v_price := v_service.price_group;
  else
    v_price := v_service.price_one_on_one;
  end if;

  -- NULL = the tutor does not teach this course in that format. Never
  -- substitute the other format's price.
  if v_price is null then
    raise exception 'format_not_offered: %', v_mode;
  end if;
  if v_price < 0 then
    raise exception 'invalid_price';
  end if;

  v_total := round(v_price * 100)::bigint * v_semesters;
  if v_total <= 0 then
    raise exception 'invalid_price';
  end if;

  select * into v_engagement
    from public.engagements
   where student_id = p_student_id
     and tutor_service_id = p_tutor_service_id
     and status in ('pending_payment', 'active')
   order by created_at desc
   limit 1
   for update;

  if v_engagement.id is not null then
    if v_engagement.status = 'active'
       or coalesce(v_engagement.paid_amount, 0) > 0 then
      raise exception 'engagement_already_paid';
    end if;

    -- Unpaid quote: re-price it to what the student is buying now (format
    -- and semesters). Safe because no money has landed, and the caller
    -- reads the total back.
    update public.engagements
       set agreed_total     = v_total,
           session_mode     = v_mode,
           semesters        = v_semesters,
           course_id        = v_service.course_id,
           tutor_profile_id = v_service.tutor_profile_id,
           updated_at       = now()
     where id = v_engagement.id;

    return v_engagement.id;
  end if;

  insert into public.engagements (
    student_id, tutor_profile_id, course_id, tutor_service_id,
    agreed_total, status, paid_amount, session_mode, semesters
  ) values (
    p_student_id, v_service.tutor_profile_id, v_service.course_id,
    v_service.id, v_total, 'pending_payment', 0, v_mode, v_semesters
  )
  returning id into v_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_id, 'engagement.created', actor_id,
          case when actor_id = p_student_id then 'student' else 'admin' end,
          'app',
          jsonb_build_object('agreed_total', v_total,
                             'plan', 'cart',
                             'session_mode', v_mode,
                             'semesters', v_semesters,
                             'course_id', v_service.course_id));

  return v_id;
end;
$$;

comment on function public.prepare_cart_engagement(uuid, uuid, uuid, text, integer) is
  'Find-or-create the unpaid agreement for one cart line. agreed_total = the per-semester price for the chosen format × p_semesters (1..4), computed from tutor_services — never from the client. Re-prices an unpaid quote; refuses one that has money on it (engagement_already_paid).';

-- PostgREST caches function signatures; tell it the 4-arg version is gone.
notify pgrst, 'reload schema';
