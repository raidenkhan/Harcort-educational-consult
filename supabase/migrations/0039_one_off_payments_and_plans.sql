-- ============================================================================
-- Harcourt Educational Consult — 0039: one-off payments + real plans
--
-- Until now EVERY engagement was created with an installment (0029 wrote one
-- row for the full fee), so "installment" and "payment" meant the same thing.
-- They are not the same thing. Not every payment is an installment; an
-- installment is something an admin creates ON PURPOSE when a student cannot
-- pay the semester fee in one go.
--
-- What changes:
--
--   1. ONE-OFF IS THE DEFAULT. `create_payment_engagement` no longer writes an
--      installment. The paywall charges the whole semester fee in one charge
--      against the ENGAGEMENT; paying it in full activates the agreement.
--      The paywall keeps the "contact the admin" button, so a student who
--      can't pay in full still has both routes out (WhatsApp + in-site chat).
--
--   2. `engagements.paid_amount` — the engagement's own paid counter, in
--      pesewas. It is written ONLY by the two RPCs that also write the
--      `payments` row, in the same transaction, so it can never disagree with
--      the ledger. An installment-less engagement now has a real "paid" figure
--      instead of an empty join. Backfilled from `payments` where status='paid'.
--
--   3. `payments.installment_id` becomes NULLABLE, and its FK becomes
--      `on delete set null` (was `on delete cascade` — deleting a schedule
--      must never delete money). A payment row's identity is its reference;
--      the installment link is bookkeeping.
--
--   4. THE APPLY / RECORD / LINK RPCs work against the engagement when there
--      is no installment, and SPILL across installments in idx order when a
--      charge is bigger than the first open part (an admin link for "half"
--      on a 3-part plan must settle part 1 and part of part 2). This also
--      fixes a latent bug: `admin_record_part_payment` used to credit only
--      the FIRST open installment, so a record spanning two parts left
--      `installments` behind `payments` forever.
--
--   5. `admin_create_installment_plan` — the admin splits a PENDING,
--      completely unpaid agreement into 1..12 parts with due dates. The parts
--      must add up to the agreed total, and the plan is frozen the moment the
--      first pesewa lands ("only before any payment").
--
--   6. Guards that read "no unpaid installments" as "fully paid" are wrong
--      the moment installments stop being mandatory: an installment-less
--      agreement would look settled while nothing was paid. `request_payout`
--      and `complete_engagement` now also require `paid_amount = agreed_total`.
--
--   7. `sync_installment_deadlines` (the old "installment 2 tracks the last
--      session" policy) only runs where no admin plan was defined — an
--      admin's schedule must not be rewritten when a session is booked.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema: the engagement's own paid counter, and a nullable installment link
-- ---------------------------------------------------------------------------

alter table public.engagements
  add column if not exists paid_amount bigint not null default 0;

alter table public.engagements drop constraint if exists engagements_paid_amount_check;
do $$ begin
  alter table public.engagements
    add constraint engagements_paid_amount_check check (paid_amount >= 0);
exception when duplicate_object then null; end $$;

-- NOT NULL first, then the FK action: `set null` needs a nullable column.
alter table public.payments alter column installment_id drop not null;

alter table public.payments drop constraint if exists payments_installment_id_fkey;
do $$ begin
  alter table public.payments
    add constraint payments_installment_id_fkey
    foreign key (installment_id) references public.installments (id)
    on delete set null;
exception when duplicate_object then null; end $$;

-- Backfill from the ledger. `payments.amount` is the NET figure that was
-- actually applied (0034 keeps the Paystack fee out of it), which is exactly
-- what installments.paid_amount accumulates — the two agree on every live row.
update public.engagements e
   set paid_amount = coalesce(
         (select sum(p.amount) from public.payments p
           where p.engagement_id = e.id and p.status = 'paid'), 0)
 where e.paid_amount is distinct from coalesce(
         (select sum(p.amount) from public.payments p
           where p.engagement_id = e.id and p.status = 'paid'), 0);

-- ---------------------------------------------------------------------------
-- 2) Engagement creation: NO installment — one-off is the default
-- ---------------------------------------------------------------------------

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
  -- (0029: the FULL semester fee). NO installment is written — 0039 makes the
  -- one-off charge the default and leaves installments to admin-created plans.
  v_total := round(v_price * 100)::bigint;

  insert into public.engagements (
    student_id, tutor_profile_id, course_id, tutor_service_id, agreed_total, status, paid_amount
  ) values (
    p_student_id, v_service.tutor_profile_id, v_service.course_id,
    v_service.id, v_total, 'pending_payment', 0
  )
  on conflict do nothing
  returning id into v_engagement_id;

  if v_engagement_id is null then
    raise exception 'engagement_exists';
  end if;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_engagement_id, 'engagement.created', actor_id, v_actor_role, 'app',
          jsonb_build_object('agreed_total', v_total,
                             'plan', 'one_off',
                             'session_mode', v_mode,
                             'course_id', v_service.course_id,
                             'request_id', p_request_id));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.engagement_created', 'tutor', (select profile_id from public.tutor_profiles where id = v_service.tutor_profile_id), v_engagement_id, '{}'::jsonb),
    ('payment.engagement_created', 'admin', null, v_engagement_id, '{}'::jsonb);

  return v_engagement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Verified-payment apply: works with or without an installment
-- ---------------------------------------------------------------------------

-- The engagement is now locked FIRST and the installment second — the order
-- `admin_record_part_payment` already used. Locking in opposite orders could
-- deadlock a webhook against an admin recording a payment at the same moment.
--
-- The amount guard moved to the ENGAGEMENT (agreed_total − paid_amount): a
-- part-payment link on a multi-part plan may legitimately be bigger than the
-- first open part, and the credit below spills across parts in idx order.
create or replace function public.payment_apply_verified_payment(
  p_engagement_id      uuid,
  p_installment_id     uuid,
  p_paystack_reference text,
  p_amount             bigint,
  p_currency           text,
  p_paystack_status    text,
  p_raw                jsonb
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_payment_id       uuid;
  v_installment      record;
  v_has_installment  boolean := false;
  v_prev_status      text;
  v_paid_total       bigint;
  v_engagement       record;
  v_fee              bigint;
  v_tutor_profile_id uuid;
  v_request_id       uuid;
  v_mode             text;
  v_group_id         uuid;
  v_remaining        bigint;
  v_open             record;
  v_apply            bigint;
  v_payload          jsonb;
begin
  -- Idempotency: a replayed webhook for a payment that has ALREADY been
  -- applied is a no-op. The row written at checkout initiation is
  -- 'initialized' — it must NOT short-circuit here, or the verified charge
  -- never reaches the agreement.
  select id into v_payment_id
    from public.payments
    where paystack_reference = p_paystack_reference
      and status = 'paid'
    limit 1;
  if v_payment_id is not null then
    return v_payment_id;
  end if;

  -- Lock the engagement first: two concurrent applies must serialize here, or
  -- both could read status='pending_payment' and both fire activation. It is
  -- also the lock `admin_record_part_payment` takes, so the two never cycle.
  select * into v_engagement
    from public.engagements
    where id = p_engagement_id
    for update;

  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;

  v_has_installment := p_installment_id is not null;
  if v_has_installment then
    select * into v_installment
      from public.installments
      where id = p_installment_id and engagement_id = p_engagement_id
      for update;

    if v_installment.id is null then
      raise exception 'installment_not_found';
    end if;
    if v_installment.status not in ('pending', 'overdue') then
      raise exception 'installment_not_payable: status %', v_installment.status;
    end if;
  end if;

  -- The platform's own expectation wins over anything in the payload.
  if p_currency <> v_engagement.currency then
    raise exception 'currency_mismatch: expected %, got %', v_engagement.currency, p_currency;
  end if;
  if p_amount <= 0 then
    raise exception 'amount_mismatch: non-positive amount %', p_amount;
  end if;
  -- Overpay is a hard reject; underpay (a part payment) is accepted. The
  -- caller passes the NET course amount (not the gross charge that includes
  -- the Paystack fee), so this guard keeps its original meaning — now measured
  -- against the whole agreement, which is what an installment-less one-off
  -- payment actually owes.
  if p_amount > v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0) then
    raise exception 'amount_mismatch: agreement has % outstanding, got %',
      v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0), p_amount;
  end if;

  v_prev_status := v_engagement.status;

  -- Upsert by reference: the row usually already exists as 'initialized'
  -- (written by the checkout-initiation step). A webhook with no row (e.g. an
  -- init lost to a rolled-back request) is still fine — the charge was
  -- verified against Paystack before this RPC ran. Either way the row ends
  -- 'paid' exactly once. `amount` and `fee_amount` on an existing row are
  -- left alone: they record what checkout actually initialized.
  insert into public.payments (
    engagement_id, installment_id, amount, currency, paystack_reference,
    paystack_status, status, verified_at, raw_payload
  ) values (
    p_engagement_id, p_installment_id, p_amount, p_currency, p_paystack_reference,
    p_paystack_status, 'paid', now(), p_raw
  )
  on conflict (paystack_reference) do update
    set status = 'paid',
        paystack_status = excluded.paystack_status,
        verified_at = now(),
        raw_payload = excluded.raw_payload,
        updated_at = now()
    where public.payments.status <> 'paid'
  returning id into v_payment_id;

  if v_payment_id is null then
    -- Already 'paid' (replay race) — the engagement FOR UPDATE lock above
    -- serializes applies, so if we got past the payability guard with another
    -- transaction mid-flight, the winner did the work. Return its id.
    select id into v_payment_id from public.payments
      where paystack_reference = p_paystack_reference limit 1;
    return v_payment_id;
  end if;

  -- The fee checkout charged the student, preserved by the upsert above. It
  -- is what turns the "payment received" email into an itemised invoice.
  select fee_amount into v_fee from public.payments where id = v_payment_id;

  -- Spread the credit across the schedule, oldest part first, so a charge
  -- bigger than one part (an admin link for "half" of a 3-part plan) settles
  -- part 1 and the remainder of part 2 instead of being capped at part 1.
  -- An agreement with no installments simply has nothing to spread over —
  -- its whole balance lives on the engagement below.
  v_remaining := p_amount;
  for v_open in
    select * from public.installments
     where engagement_id = p_engagement_id
       and status in ('pending', 'overdue')
     order by idx
     for update
  loop
    exit when v_remaining <= 0;

    v_apply := least(v_remaining, v_open.amount - v_open.paid_amount);
    update public.installments
      set paid_amount = paid_amount + v_apply,
          status = case
            when paid_amount + v_apply >= amount then 'paid'::public.installment_status
            else status end,
          paid_at = case
            when paid_amount + v_apply >= amount then now() else paid_at end,
          was_overdue = (was_overdue or status = 'overdue')
        where id = v_open.id;
    v_remaining := v_remaining - v_apply;
  end loop;

  -- The engagement's own counter: the ledger-backed figure every reader uses.
  v_paid_total := coalesce(v_engagement.paid_amount, 0) + p_amount;
  update public.engagements
    set paid_amount = v_paid_total, updated_at = now()
    where id = p_engagement_id;

  -- Activation: collected (including partials) reaches half the total. A
  -- one-off payment is the full total, so it passes on the first charge.
  if v_prev_status = 'pending_payment' and v_paid_total * 2 >= v_engagement.agreed_total then
    update public.engagements
      set status = 'active', updated_at = now()
      where id = p_engagement_id;

    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (p_engagement_id, 'engagement.activated', null, 'system', 'webhook',
            jsonb_build_object('paid_pesewas', v_paid_total));

    -- The tutor recipient is the TUTOR's profile — 0034 pointed this at the
    -- student, so the tutor never got the activation email.
    insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
      ('payment.engagement_activated', 'tutor',
        (select tp.profile_id from public.tutor_profiles tp where tp.id = v_engagement.tutor_profile_id),
        p_engagement_id, '{}'::jsonb),
      ('payment.engagement_activated', 'admin', null, p_engagement_id, '{}'::jsonb);
  end if;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'payment.applied', null, 'system', 'webhook',
          jsonb_build_object('amount', p_amount,
                             'reference', p_paystack_reference,
                             'paid_pesewas', v_paid_total));

  if v_has_installment then
    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (p_engagement_id, 'installment.paid', null, 'system', 'webhook',
            jsonb_build_object('installment_idx', v_installment.idx,
                               'amount', p_amount,
                               'installment_paid_amount', v_installment.paid_amount + p_amount,
                               'reference', p_paystack_reference));
  end if;

  -- The reference and fee are what let the student-facing row be a real
  -- invoice (course, fee, total charged, reference to quote) rather than a
  -- bare "we got your money" note. `installment_idx` is only present when the
  -- charge actually named a part — a one-off payment has none.
  v_payload := jsonb_build_object('amount', p_amount,
                                  'reference', p_paystack_reference,
                                  'fee_amount', v_fee);
  if v_has_installment then
    v_payload := v_payload || jsonb_build_object('installment_idx', v_installment.idx);
  end if;

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.received', 'student', v_engagement.student_id, p_engagement_id, v_payload),
    ('payment.received', 'tutor',
      (select tp.profile_id from public.tutor_profiles tp where tp.id = v_engagement.tutor_profile_id),
      p_engagement_id, v_payload),
    ('payment.received', 'admin', null, p_engagement_id, v_payload);

  -- Payment confirms the booking. Auto-accept the matching PENDING request
  -- only: a declined or withdrawn request is never resurrected. Exact course
  -- match wins; a course-less request (the student asked without picking a
  -- course) is accepted as the fallback. The accepted row is captured so a
  -- GROUP booking can be seated below.
  update public.tutor_requests r
     set status = 'accepted'::public.tutor_request_status,
         responded_at = now(),
         updated_at = now()
   where r.id = (
     select r2.id
       from public.tutor_requests r2
       join public.tutor_services ts on ts.id = v_engagement.tutor_service_id
      where r2.student_id = v_engagement.student_id
        and r2.tutor_profile_id = v_engagement.tutor_profile_id
        and r2.status = 'pending'
        and (r2.course_id = ts.course_id or r2.course_id is null)
      order by (r2.course_id = ts.course_id) desc, r2.created_at desc
      limit 1
   )
  returning r.id, r.session_mode into v_request_id, v_mode;

  -- A group booking means the student belongs in the tutor's group for this
  -- course. Only the tutor's own non-archived group qualifies; if they haven't
  -- made one yet the booking still stands and they can add the student from
  -- the members sheet.
  if v_request_id is not null and v_mode = 'group' then
    select tp.profile_id into v_tutor_profile_id
      from public.tutor_profiles tp
     where tp.id = v_engagement.tutor_profile_id;

    if v_tutor_profile_id is not null then
      -- The catalogue seeds shared courses once PER PROGRAMME (0030), so one
      -- real course has several rows — "ME 261 Dynamics of Solid Mechanics"
      -- has four. course_id is therefore NOT a stable identity, and matching
      -- on it alone means a group attached to one copy never matches a
      -- booking made against another. The CODE is the identity (the same
      -- normalisation the library already uses); an exact row match still
      -- wins when both are qualified.
      select g.id into v_group_id
        from public.study_groups g
        join public.courses gc on gc.id = g.course_id
        join public.courses ec on ec.id = v_engagement.course_id
       where g.created_by = v_tutor_profile_id
         and g.is_archived = false
         and (
              (gc.code is not null and ec.code is not null
               and upper(regexp_replace(gc.code, '\s+', ' ', 'g'))
                   = upper(regexp_replace(ec.code, '\s+', ' ', 'g')))
           or (gc.code is null and ec.code is null
               and g.course_id = v_engagement.course_id)
         )
       order by (g.course_id = v_engagement.course_id) desc, g.created_at desc
       limit 1;

      if v_group_id is not null then
        -- Members first, so the message below is unread for the new student.
        insert into public.study_group_members (group_id, profile_id, role)
        values (v_group_id, v_engagement.student_id, 'member')
        on conflict (group_id, profile_id) do nothing;

        -- FOUND is false when they were already a member: no duplicate line
        -- and no duplicate email on a replayed payment.
        if found then
          insert into public.study_group_messages (group_id, sender_id, body)
          values (v_group_id, v_tutor_profile_id,
                  coalesce((select full_name from public.profiles
                             where id = v_engagement.student_id), 'A student')
                    || ' joined the group after booking group sessions.');

          insert into public.notification_outbox (type, audience, recipient_id, data)
          values ('payment.group_joined', 'tutor', v_tutor_profile_id,
                  jsonb_build_object('group_id', v_group_id,
                                     'course_id', v_engagement.course_id,
                                     'student_id', v_engagement.student_id));
        end if;
      end if;
    end if;
  end if;

  return v_payment_id;
end;
$$;

comment on function public.payment_apply_verified_payment(uuid, uuid, text, bigint, text, text, jsonb) is
  'Applies a Paystack-verified charge. p_amount is the NET course amount; the gross charge (amount + fee_amount) is verified by the caller before this call. p_installment_id may be NULL (0039 — a one-off payment settles the agreement itself). Idempotent on an already-paid reference. A successful payment auto-accepts the matching pending tutor request (payment confirms the booking), and a GROUP booking seats the student in the tutor''s study group for that course. The student-facing outbox row carries the reference and fee so it can render as an invoice.';

-- ---------------------------------------------------------------------------
-- 4) Admin-recorded part payment: installment optional, spill across parts
-- ---------------------------------------------------------------------------

create or replace function public.admin_record_part_payment(
  actor_id        uuid,
  p_engagement_id uuid,
  p_amount        bigint,
  p_note          text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_engagement   record;
  v_installment  record;
  v_payment_id   uuid;
  v_reference    text;
  v_outstanding  bigint;
  v_prev_status  text;
  v_remaining    bigint;
  v_apply        bigint;
  v_first_open   uuid;
  v_payload      jsonb;
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_mismatch: amount must be positive';
  end if;

  select * into v_engagement
    from public.engagements
    where id = p_engagement_id
    for update;
  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;
  if v_engagement.status = 'cancelled' then
    raise exception 'engagement_cancelled';
  end if;

  -- Outstanding across the WHOLE agreement (partials leave residual owed).
  -- Read from the engagement's own counter: it exists for installment-less
  -- one-off agreements too, and it is the figure the ledger backs.
  v_outstanding := v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0);

  if p_amount > v_outstanding then
    raise exception 'amount_exceeds_outstanding: % owed, got %', v_outstanding, p_amount;
  end if;

  v_prev_status := v_engagement.status;
  v_reference := 'ADMIN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  -- Name the part this record starts at (for the audit trail); null when the
  -- agreement has no schedule — a one-off payment settles the agreement itself.
  select id into v_first_open
    from public.installments
   where engagement_id = p_engagement_id
     and status in ('pending', 'overdue')
   order by idx
   limit 1;

  insert into public.payments (
    engagement_id, installment_id, amount, currency, paystack_reference,
    paystack_status, status, initialized_by, verified_at, raw_payload
  ) values (
    p_engagement_id, v_first_open, p_amount, v_engagement.currency, v_reference,
    'admin_recorded', 'paid', actor_id, now(),
    jsonb_build_object('source', 'admin_recorded', 'note', p_note, 'recorded_by', actor_id)
  )
  returning id into v_payment_id;

  -- Spread across the schedule, oldest part first. Crediting only the first
  -- open part (the old behaviour) left `installments` behind `payments`
  -- whenever a record spanned two parts, which then blocked the payout guard.
  v_remaining := p_amount;
  for v_installment in
    select * from public.installments
     where engagement_id = p_engagement_id
       and status in ('pending', 'overdue')
     order by idx
     for update
  loop
    exit when v_remaining <= 0;

    v_apply := least(v_remaining, v_installment.amount - v_installment.paid_amount);
    update public.installments
      set paid_amount = paid_amount + v_apply,
          status = case
            when paid_amount + v_apply >= amount then 'paid'::public.installment_status
            else status end,
          paid_at = case
            when paid_amount + v_apply >= amount then now() else paid_at end,
          was_overdue = (was_overdue or status = 'overdue')
        where id = v_installment.id;
    v_remaining := v_remaining - v_apply;
  end loop;

  -- Recording a part payment IS the admin approving the plan: the agreement
  -- activates on the first recorded pesewa (no 50% threshold here).
  update public.engagements
    set paid_amount = coalesce(v_engagement.paid_amount, 0) + p_amount,
        status = case
          when v_prev_status = 'pending_payment' then 'active'::public.engagement_status
          else status end,
        updated_at = now()
    where id = p_engagement_id;

  if v_prev_status = 'pending_payment' then
    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (p_engagement_id, 'engagement.activated', actor_id, 'admin', 'rpc',
            jsonb_build_object('paid_pesewas', p_amount, 'reason', 'admin_recorded_part_payment'));
  end if;

  v_payload := jsonb_build_object('payment_id', v_payment_id,
                                  'amount', p_amount,
                                  'reference', v_reference,
                                  'note', p_note);
  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'payment.admin_recorded', actor_id, 'admin', 'rpc', v_payload);

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.received', 'student', v_engagement.student_id, p_engagement_id,
      v_payload || jsonb_build_object('source', 'admin_recorded')),
    ('payment.received', 'tutor',
      (select profile_id from public.tutor_profiles tp where tp.id = v_engagement.tutor_profile_id), p_engagement_id,
      v_payload || jsonb_build_object('source', 'admin_recorded')),
    ('payment.received', 'admin', null, p_engagement_id,
      v_payload || jsonb_build_object('source', 'admin_recorded'));

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Part-payment links: outstanding from the engagement, not the schedule
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_payment_request(
  actor_id        uuid,
  p_engagement_id uuid,
  p_token_hash    text,
  p_amount        bigint,
  p_note          text default null,
  p_expires_at    timestamptz default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_engagement  record;
  v_request_id  uuid;
  v_outstanding bigint;
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;
  if p_token_hash is null or char_length(p_token_hash) < 32 then
    raise exception 'invalid_token';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_mismatch: amount must be positive';
  end if;

  select * into v_engagement
    from public.engagements
    where id = p_engagement_id
    for update;
  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;
  if v_engagement.status = 'cancelled' then
    raise exception 'engagement_cancelled';
  end if;

  v_outstanding := v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0);

  if v_outstanding <= 0 then
    raise exception 'payments_outstanding: nothing left to pay';
  end if;
  if p_amount > v_outstanding then
    raise exception 'amount_exceeds_outstanding: % owed, got %', v_outstanding, p_amount;
  end if;

  insert into public.payment_requests (
    engagement_id, token_hash, amount, note, created_by, expires_at
  ) values (
    p_engagement_id, p_token_hash, p_amount, nullif(btrim(p_note), ''), actor_id, p_expires_at
  )
  returning id into v_request_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'payment_request.created', actor_id, 'admin', 'app',
          jsonb_build_object('payment_request_id', v_request_id, 'amount', p_amount));

  return v_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Payout / completion: "no unpaid installments" no longer means "paid"
-- ---------------------------------------------------------------------------

-- request_payout — the tutor (or admin, or the auto-completion path) opens a
-- payout for a fully-paid, fully-delivered engagement. With installments no
-- longer mandatory (0039), counting unpaid installments would read an
-- installment-less agreement as settled while nothing had been paid, so the
-- engagement's own counter is now the authoritative gate.
create or replace function public.request_payout(
  actor_id       uuid,
  p_engagement_id uuid
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_engagement   record;
  v_tutor_id     uuid;
  v_open_sessions integer;
  v_due          integer;
  v_flags        jsonb := '{}'::jsonb;
  v_flagged      boolean := false;
  v_payout_id    uuid;
  v_fee          bigint;
  v_share        bigint;
  v_recipient    text;
  v_actor_role   text;
begin
  if actor_id is null then
    raise exception 'forbidden: actor required';
  end if;

  select * into v_engagement from public.engagements where id = p_engagement_id;
  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;

  select profile_id into v_tutor_id
    from public.tutor_profiles where id = v_engagement.tutor_profile_id;

  if actor_id <> v_tutor_id and not public.is_admin(actor_id) then
    raise exception 'forbidden: the engagement''s tutor or an admin only';
  end if;
  if actor_id = v_tutor_id then v_actor_role := 'tutor'; else v_actor_role := 'admin'; end if;

  if v_engagement.status = 'cancelled' then
    raise exception 'engagement_cancelled';
  end if;

  -- Completion proof: no session between the pair left un-ticked. Cancelled
  -- sessions (soft-deletes) don't count as undelivered.
  select count(*) into v_open_sessions
    from public.tutoring_sessions s
    where s.tutor_profile_id = v_engagement.tutor_profile_id
      and s.student_id = v_engagement.student_id
      and s.status = 'scheduled'
      and (s.tutor_confirmed_at is null or s.student_confirmed_at is null);

  if v_open_sessions > 0 then
    raise exception 'sessions_incomplete: % unconfirmed session(s)', v_open_sessions;
  end if;

  -- Every pesewa must be in before a payout exists. This is the check that
  -- actually carries the weight now: an installment-less agreement has no
  -- schedule to inspect, so the ledger-backed counter is the only honest gate.
  if coalesce(v_engagement.paid_amount, 0) < v_engagement.agreed_total then
    raise exception 'payments_outstanding: % of % pesewas still owed',
      v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0),
      v_engagement.agreed_total;
  end if;

  -- Belt and braces for a plan whose parts somehow lag the ledger.
  select count(*) into v_due
    from public.installments
    where engagement_id = p_engagement_id and status in ('pending', 'overdue');
  if v_due > 0 then
    raise exception 'payments_outstanding: % installment(s) unpaid', v_due;
  end if;

  -- Flag scoring → hybrid release. Clean = auto-approve; flagged = admin queue.
  select count(*) into v_due
    from public.installments
    where engagement_id = p_engagement_id and was_overdue;
  if v_due > 0 then
    v_flags := v_flags || jsonb_build_object('overdue_history', v_due);
    v_flagged := true;
  end if;

  select count(*) into v_due
    from public.tutoring_sessions s
    where s.tutor_profile_id = v_engagement.tutor_profile_id
      and s.student_id = v_engagement.student_id
      and s.status = 'cancelled';
  if v_due > 0 then
    v_flags := v_flags || jsonb_build_object('cancelled_sessions', v_due);
    v_flagged := true;
  end if;

  v_fee   := public.payment_platform_fee(v_engagement.agreed_total, v_engagement.platform_fee_bps);
  v_share := v_engagement.agreed_total - v_fee;

  select recipient_code into v_recipient
    from public.tutor_payout_accounts
    where tutor_profile_id = v_engagement.tutor_profile_id and verified_at is not null
    limit 1;
  if v_recipient is null then
    raise exception 'payout_account_unverified: tutor must verify MoMo details first';
  end if;

  insert into public.payouts (
    engagement_id, tutor_profile_id, amount, platform_fee,
    status, flag_reason, recipient_code, released_by
  ) values (
    p_engagement_id, v_engagement.tutor_profile_id, v_share, v_fee,
    case when v_flagged then 'pending_review'::public.payout_status
         else 'approved'::public.payout_status end,
    case when v_flagged then v_flags::text else null end,
    v_recipient,
    case when v_flagged and v_actor_role = 'admin' then actor_id else null end
  )
  on conflict do nothing
  returning id into v_payout_id;

  if v_payout_id is null then
    raise exception 'payout_exists';
  end if;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'payout.requested', actor_id, v_actor_role, 'app',
          jsonb_build_object('payout_id', v_payout_id, 'amount', v_share, 'fee', v_fee,
                             'flagged', v_flagged, 'flags', v_flags));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  select 'payment.payout_requested', a.audience, a.recipient_id, p_engagement_id,
         jsonb_build_object('amount', v_share, 'flagged', v_flagged)
    from (select 'student' as audience, v_engagement.student_id as recipient_id
          union all
          select 'tutor', v_tutor_id
          union all
          select 'admin', null::uuid) a;

  return v_payout_id;
end;
$$;

-- complete_engagement — same gate: an agreement with no schedule must still
-- be fully paid before it can be closed out.
create or replace function public.complete_engagement(
  actor_id       uuid,
  p_engagement_id uuid
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_engagement record;
  v_open integer;
  v_due integer;
begin
  if not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_engagement from public.engagements where id = p_engagement_id;
  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;

  select count(*) into v_open
    from public.tutoring_sessions s
    where s.tutor_profile_id = v_engagement.tutor_profile_id
      and s.student_id = v_engagement.student_id
      and s.status = 'scheduled'
      and (s.tutor_confirmed_at is null or s.student_confirmed_at is null);

  select count(*) into v_due
    from public.installments
    where engagement_id = p_engagement_id and status in ('pending', 'overdue');

  if v_open > 0 or v_due > 0 or coalesce(v_engagement.paid_amount, 0) < v_engagement.agreed_total then
    raise exception 'not_completable: % open session(s), % unpaid installment(s), % pesewas still owed',
      v_open, v_due,
      greatest(v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0), 0);
  end if;

  update public.engagements
    set status = 'completed', updated_at = now()
    where id = p_engagement_id and status <> 'completed';

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'engagement.completed', actor_id, 'admin', 'app', '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) The legacy deadline policy only applies where no plan was defined
-- ---------------------------------------------------------------------------

-- sync_installment_deadlines moved "installment 2" to the pair's last session
-- date — correct for the old 50/50 shape, wrong for an admin's schedule. An
-- admin-created plan (0039) keeps the dates the admin chose.
create or replace function public.sync_installment_deadlines(
  actor_id       uuid,
  p_engagement_id uuid
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_engagement record;
  v_last_session timestamptz;
begin
  select * into v_engagement from public.engagements where id = p_engagement_id;
  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;

  if actor_id is null or (
    actor_id <> v_engagement.student_id
    and not exists (
      select 1 from public.tutor_profiles tp
      where tp.id = v_engagement.tutor_profile_id and tp.profile_id = actor_id
    )
    and not public.is_admin(actor_id)
  ) then
    raise exception 'forbidden: participant or admin only';
  end if;

  -- An admin defined this schedule: booking a session must not move it.
  if exists (
    select 1 from public.payment_events pe
     where pe.engagement_id = p_engagement_id
       and pe.type = 'engagement.plan_created'
  ) then
    return;
  end if;

  select max(s.scheduled_at) into v_last_session
    from public.tutoring_sessions s
    where s.tutor_profile_id = v_engagement.tutor_profile_id
      and s.student_id = v_engagement.student_id
      and s.status = 'scheduled';

  if v_last_session is null then
    return;  -- nothing scheduled yet; fallback deadline stands
  end if;

  update public.installments
    set due_at = greatest(v_last_session, now() + interval '1 day')
    where engagement_id = p_engagement_id
      and idx = 2
      and status = 'pending';

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'installment.deadline_synced', actor_id,
          case when actor_id = v_engagement.student_id then 'student'
               when exists (select 1 from public.tutor_profiles tp where tp.id = v_engagement.tutor_profile_id and tp.profile_id = actor_id) then 'tutor'
               else 'admin' end,
          'app', jsonb_build_object('due_at', v_last_session));
end;
$$;

-- The overdue email said "installment N of 2" — true in the 50/50 era, wrong
-- for a plan of any other length. Carry the part count in the payload.
create or replace function public.payment_sweep_overdue()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
  v_parts integer;
begin
  for v_row in
    update public.installments
      set status = 'overdue', was_overdue = true
      where status = 'pending' and due_at < now()
      returning engagement_id, idx, amount
  loop
    v_count := v_count + 1;

    select count(*) into v_parts
      from public.installments
     where engagement_id = v_row.engagement_id;

    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (v_row.engagement_id, 'installment.overdue', null, 'system', 'cron',
            jsonb_build_object('installment_idx', v_row.idx, 'amount', v_row.amount));

    insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
    select 'payment.overdue', a.audience, a.recipient_id, v_row.engagement_id,
           jsonb_build_object('installment_idx', v_row.idx, 'amount', v_row.amount,
                              'parts', v_parts)
      from (select 'student' as audience, e.student_id as recipient_id
              from public.engagements e where e.id = v_row.engagement_id
            union all
            select 'tutor', tp.profile_id
              from public.engagements e
              join public.tutor_profiles tp on tp.id = e.tutor_profile_id
             where e.id = v_row.engagement_id
            union all
            select 'admin', null::uuid
              from public.engagements e where e.id = v_row.engagement_id) a;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) The plan itself — an admin splitting an unpaid agreement
-- ---------------------------------------------------------------------------

-- A plan is decided UP FRONT: the admin picks the parts and their dates while
-- the agreement is still untouched, and the schedule is frozen the moment the
-- first pesewa lands. The parts must add up to the agreed total — a plan that
-- under- or over-counts would leave the ledger and the schedule disagreeing
-- about what is owed.
create or replace function public.admin_create_installment_plan(
  actor_id        uuid,
  p_engagement_id uuid,
  p_amounts       bigint[],
  p_due_dates     timestamptz[]
) returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_engagement  record;
  v_n           integer;
  v_sum         bigint := 0;
  v_paid_inst   bigint;
  v_paid_rows   integer;
  i             integer;
  v_plan        jsonb := '[]'::jsonb;
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_engagement
    from public.engagements
    where id = p_engagement_id
    for update;
  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;
  if v_engagement.status = 'cancelled' then
    raise exception 'engagement_cancelled';
  end if;

  -- Only before any payment: once the student starts paying, the plan stands.
  if coalesce(v_engagement.paid_amount, 0) > 0 then
    raise exception 'payments_already_started: a plan can only be set before the first payment';
  end if;
  select coalesce(sum(i.paid_amount), 0) into v_paid_inst
    from public.installments i
   where i.engagement_id = p_engagement_id;
  if v_paid_inst > 0 then
    raise exception 'payments_already_started: a plan can only be set before the first payment';
  end if;
  select count(*) into v_paid_rows
    from public.payments p
   where p.engagement_id = p_engagement_id and p.status = 'paid';
  if v_paid_rows > 0 then
    raise exception 'payments_already_started: a plan can only be set before the first payment';
  end if;

  v_n := coalesce(array_length(p_amounts, 1), 0);
  if v_n < 1 or v_n > 12 then
    raise exception 'plan_invalid: a plan has between 1 and 12 parts';
  end if;
  if coalesce(array_length(p_due_dates, 1), 0) <> v_n then
    raise exception 'plan_invalid: every part needs a due date';
  end if;

  for i in 1 .. v_n loop
    if p_amounts[i] is null or p_amounts[i] <= 0 then
      raise exception 'plan_invalid: part % must be above zero', i;
    end if;
    if p_due_dates[i] is null then
      raise exception 'plan_invalid: part % needs a due date', i;
    end if;
    if i > 1 and p_due_dates[i] <= p_due_dates[i - 1] then
      raise exception 'plan_invalid: due dates must run in order';
    end if;
    v_sum := v_sum + p_amounts[i];
  end loop;

  if v_sum <> v_engagement.agreed_total then
    raise exception 'plan_total_mismatch: the parts add up to %, the agreement is %',
      v_sum, v_engagement.agreed_total;
  end if;

  -- Replace the schedule. The payments FK is `on delete set null` (see §1), so
  -- a payment row that referenced an old part keeps its money and simply
  -- loses the link — deleting a schedule must never delete a ledger row.
  delete from public.installments where engagement_id = p_engagement_id;

  for i in 1 .. v_n loop
    insert into public.installments (engagement_id, idx, amount, due_at, paid_amount)
    values (p_engagement_id, i, p_amounts[i], p_due_dates[i], 0);
    v_plan := v_plan || jsonb_build_object('idx', i,
                                           'amount', p_amounts[i],
                                           'due_at', p_due_dates[i]);
  end loop;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'engagement.plan_created', actor_id, 'admin', 'app',
          jsonb_build_object('parts', v_n,
                             'agreed_total', v_engagement.agreed_total,
                             'schedule', v_plan));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.plan_created', 'student', v_engagement.student_id, p_engagement_id,
      jsonb_build_object('parts', v_n, 'agreed_total', v_engagement.agreed_total)),
    ('payment.plan_created', 'admin', null, p_engagement_id,
      jsonb_build_object('parts', v_n, 'agreed_total', v_engagement.agreed_total));

  return v_n;
end;
$$;

comment on function public.admin_create_installment_plan(uuid, uuid, bigint[], timestamptz[]) is
  'Splits a PENDING, entirely unpaid agreement into 1..12 installments with due dates. The parts must sum to agreed_total. Refused once any payment exists (payments_already_started) — a plan is decided up front, never renegotiated mid-payment.';
