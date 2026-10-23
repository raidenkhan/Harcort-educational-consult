-- ============================================================================
-- Harcourt Educational Consult — 0029: 100% upfront + admin-recorded payments
--
-- Pricing policy change: a student pays the FULL semester fee up front (it
-- was 50/50). A student who can't pay in full arranges it with the admin
-- (WhatsApp / in-app chat), and the admin records each part payment here —
-- money that arrived outside Paystack but belongs to the same agreement.
--
-- What changes:
--   * engagements are created with ONE installment for the full amount
--     (the idx check is relaxed from "exactly 1 or 2" to 1..12 so the
--     old 2-row shape and any future plan both stay representable);
--   * installments gain paid_amount — a payment may cover PART of an
--     installment (Paystack always charges the full remaining amount, so
--     the checkout path is unchanged in behaviour);
--   * activation still happens at ≥50% collected for Paystack payments,
--     and IMMEDIATELY on an admin-recorded payment (recording one IS the
--     admin approving the plan);
--   * new admin RPC admin_record_part_payment: ledger row + installment
--     application + activation + events + notifications, one transaction.
--
-- request_payout needs NO change: its guard ("no pending/overdue
-- installments") is satisfied exactly when the paid_amount totals reach
-- each installment's amount, i.e. when the agreement is fully settled.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Schema: relax the installment count, add partial-payment tracking
-- ---------------------------------------------------------------------------

-- The 50/50 plan required exactly idx 1 and 2. One full-amount installment
-- is now the norm; 1..12 leaves room for explicit multi-part plans.
alter table public.installments drop constraint if exists installments_idx_check;
do $$ begin
  alter table public.installments
    add constraint installments_idx_check check (idx between 1 and 12);
exception when duplicate_object then null; end $$;

-- How much has ACTUALLY landed against this installment (pesewas). A
-- partially-paid installment stays 'pending' until paid_amount >= amount.
alter table public.installments add column if not exists paid_amount bigint not null default 0
  check (paid_amount >= 0);

-- ---------------------------------------------------------------------------
-- 2) Engagement creation: ONE installment for the full quote
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
begin
  if actor_id is null then
    raise exception 'forbidden: actor required';
  end if;

  if actor_id <> p_student_id and not public.is_admin(actor_id) then
    raise exception 'forbidden: only the student or an admin can create an engagement';
  end if;

  select ts.id, ts.price, ts.course_id, tp.id as tutor_profile_id, tp.verification_status,
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

  if actor_id <> p_student_id then v_actor_role := 'admin'; else v_actor_role := 'student'; end if;

  -- Price snapshot: the tutor's quote converts to pesewas ONCE (0029: the
  -- FULL semester fee — one installment, due within the commitment window).
  v_total := (v_service.price * 100)::bigint;

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
                             'course_id', v_service.course_id,
                             'request_id', p_request_id));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.engagement_created', 'tutor', (select profile_id from public.tutor_profiles where id = v_service.tutor_profile_id), v_engagement_id, '{}'::jsonb),
    ('payment.engagement_created', 'admin', null, v_engagement_id, '{}'::jsonb);

  return v_engagement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Verified-payment apply: tolerate PARTIAL coverage of an installment
-- ---------------------------------------------------------------------------

-- Behaviour change vs 0011: p_amount may now be LESS than the installment's
-- remaining amount (it is accumulated into paid_amount; the installment flips
-- to 'paid' only when fully covered). The checkout path still charges the
-- full remaining amount, so Paystack flows behave exactly as before. The
-- activation threshold stays "half collected" — full payment passes it
-- trivially, and an early part payment of ≥50% still activates.
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
  v_payment_id     uuid;
  v_installment    record;
  v_prev_status    text;
  v_paid_sum       bigint;
  v_engagement     record;
begin
  -- Idempotency first: a replayed webhook (same reference) must be a no-op.
  select id into v_payment_id
    from public.payments
    where paystack_reference = p_paystack_reference
    limit 1;
  if v_payment_id is not null then
    return v_payment_id;
  end if;

  select * into v_installment
    from public.installments
    where id = p_installment_id and engagement_id = p_engagement_id
    for update;

  if v_installment.id is null then
    raise exception 'installment_not_found';
  end if;

  -- Lock the engagement too: two concurrent applies must serialize here, or
  -- both could read status='pending_payment' and both fire activation.
  select * into v_engagement
    from public.engagements
    where id = p_engagement_id
    for update;

  -- The platform's own expectation wins over anything in the payload.
  if p_currency <> v_engagement.currency then
    raise exception 'currency_mismatch: expected %, got %', v_engagement.currency, p_currency;
  end if;
  if p_amount <= 0 then
    raise exception 'amount_mismatch: non-positive amount %', p_amount;
  end if;
  -- Overpay is a hard reject; underpay (a part payment) is accepted.
  if p_amount > v_installment.amount - v_installment.paid_amount then
    raise exception 'amount_mismatch: installment has % outstanding, got %',
      v_installment.amount - v_installment.paid_amount, p_amount;
  end if;
  if v_installment.status not in ('pending', 'overdue') then
    raise exception 'installment_not_payable: status %', v_installment.status;
  end if;

  v_prev_status := v_engagement.status;

  -- Upsert by reference: the row usually already exists as 'initialized'
  -- (written by the checkout-initiation step). A webhook with no row (e.g. an
  -- init lost to a rolled-back request) is still fine — the charge was
  -- verified against Paystack before this RPC ran. Either way the row ends
  -- 'paid' exactly once.
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
    -- Already 'paid' (replay race) — the installment FOR UPDATE lock above
    -- serializes applies, so if we got past the payability guard with another
    -- transaction mid-flight, the winner did the work. Return its id.
    select id into v_payment_id from public.payments
      where paystack_reference = p_paystack_reference limit 1;
    return v_payment_id;
  end if;

  -- Accumulate, and close the installment only when fully covered.
  update public.installments
    set paid_amount = paid_amount + p_amount,
        status = case
          when paid_amount + p_amount >= amount then 'paid'::public.installment_status
          else status end,
        paid_at = case
          when paid_amount + p_amount >= amount then now() else paid_at end,
        was_overdue = (was_overdue or status = 'overdue')
    where id = p_installment_id;

  -- Activation: collected (including partials) reaches half the total.
  select coalesce(sum(i.paid_amount), 0) into v_paid_sum
    from public.installments i
    where i.engagement_id = p_engagement_id;

  if v_prev_status = 'pending_payment' and v_paid_sum * 2 >= v_engagement.agreed_total then
    update public.engagements
      set status = 'active', updated_at = now()
      where id = p_engagement_id;

    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (p_engagement_id, 'engagement.activated', null, 'system', 'webhook',
            jsonb_build_object('paid_pesewas', v_paid_sum));

    insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
      ('payment.engagement_activated', 'tutor',
        (select profile_id from public.profiles p where p.id = v_engagement.student_id), p_engagement_id, '{}'::jsonb),
      ('payment.engagement_activated', 'admin', null, p_engagement_id, '{}'::jsonb);
  end if;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'installment.paid', null, 'system', 'webhook',
          jsonb_build_object('installment_idx', v_installment.idx,
                             'amount', p_amount,
                             'installment_paid_amount', v_installment.paid_amount + p_amount,
                             'reference', p_paystack_reference));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.received', 'student', v_engagement.student_id, p_engagement_id,
      jsonb_build_object('installment_idx', v_installment.idx, 'amount', p_amount)),
    ('payment.received', 'tutor',
      (select profile_id from public.tutor_profiles tp join public.engagements e on e.tutor_profile_id = tp.id where e.id = p_engagement_id), p_engagement_id,
      jsonb_build_object('installment_idx', v_installment.idx, 'amount', p_amount)),
    ('payment.received', 'admin', null, p_engagement_id,
      jsonb_build_object('installment_idx', v_installment.idx, 'amount', p_amount));

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Admin-recorded part payments (money that arrived outside Paystack)
-- ---------------------------------------------------------------------------

-- admin_record_part_payment — an admin records a payment collected out of
-- band (cash, personal MoMo, bank transfer) against a student's agreement.
-- The student pays the ADMIN — never the tutor — so the row is attributed
-- to the agreement (and through it, the tutor) with a synthetic ADMIN-
-- reference, keeping the payments table's unique-reference idempotency.
--
-- Guards: admin only; engagement not cancelled; amount within the
-- outstanding balance. Side effects: payments row ('paid'), installment
-- accumulation, IMMEDIATE engagement activation (recording a part payment
-- IS the admin approving the plan), ledger event, notifications.
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
  v_paid_sum     bigint;
  v_prev_status  text;
  v_apply        bigint;
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
  select coalesce(sum(i.amount - i.paid_amount), 0) into v_outstanding
    from public.installments i
    where i.engagement_id = p_engagement_id and i.status in ('pending', 'overdue');

  if p_amount > v_outstanding then
    raise exception 'amount_exceeds_outstanding: % owed, got %', v_outstanding, p_amount;
  end if;

  -- Apply to the first open installment, oldest idx first.
  select * into v_installment
    from public.installments
    where engagement_id = p_engagement_id and status in ('pending', 'overdue')
    order by idx
    limit 1
    for update;
  if v_installment.id is null then
    raise exception 'payments_outstanding: nothing left to pay';
  end if;

  v_prev_status := v_engagement.status;
  v_reference := 'ADMIN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.payments (
    engagement_id, installment_id, amount, currency, paystack_reference,
    paystack_status, status, initialized_by, verified_at, raw_payload
  ) values (
    p_engagement_id, v_installment.id, p_amount, v_engagement.currency, v_reference,
    'admin_recorded', 'paid', actor_id, now(),
    jsonb_build_object('source', 'admin_recorded', 'note', p_note, 'recorded_by', actor_id)
  )
  returning id into v_payment_id;

  v_apply := least(p_amount, v_installment.amount - v_installment.paid_amount);
  update public.installments
    set paid_amount = paid_amount + v_apply,
        status = case
          when paid_amount + v_apply >= amount then 'paid'::public.installment_status
          else status end,
        paid_at = case
          when paid_amount + v_apply >= amount then now() else paid_at end,
        was_overdue = (was_overdue or status = 'overdue')
    where id = v_installment.id;

  -- Recording a part payment IS the admin approving the plan: the agreement
  -- activates on the first recorded pesewa (no 50% threshold here).
  if v_prev_status = 'pending_payment' then
    update public.engagements
      set status = 'active', updated_at = now()
      where id = p_engagement_id;

    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (p_engagement_id, 'engagement.activated', actor_id, 'admin', 'rpc',
            jsonb_build_object('paid_pesewas', p_amount, 'reason', 'admin_recorded_part_payment'));
  end if;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'payment.admin_recorded', actor_id, 'admin', 'rpc',
          jsonb_build_object('payment_id', v_payment_id,
                             'amount', p_amount,
                             'installment_idx', v_installment.idx,
                             'note', p_note));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.received', 'student', v_engagement.student_id, p_engagement_id,
      jsonb_build_object('amount', p_amount, 'source', 'admin_recorded')),
    ('payment.received', 'tutor',
      (select profile_id from public.tutor_profiles tp where tp.id = v_engagement.tutor_profile_id), p_engagement_id,
      jsonb_build_object('amount', p_amount, 'source', 'admin_recorded')),
    ('payment.received', 'admin', null, p_engagement_id,
      jsonb_build_object('amount', p_amount, 'source', 'admin_recorded'));

  return v_payment_id;
end;
$$;
