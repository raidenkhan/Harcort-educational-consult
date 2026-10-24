-- ============================================================================
-- Harcourt — 0034 Paystack fees charged to the student
--
-- Paystack deducts its processing fee from the money it collects, so charging
-- the course fee alone leaves Harcourt (and therefore the tutor's payout)
-- short. The student now pays `course fee + Paystack fee`; Paystack keeps its
-- fee and the agreement receives exactly the course fee.
--
--   1. `payments.fee_amount` — the processing fee added ON TOP of `amount`,
--      in pesewas. `amount` keeps its old meaning: the money applied to the
--      installment (the tutor's quote). The student's card/MoMo is charged
--      `amount + fee_amount`.
--
--      Stored per attempt, not recomputed at webhook time: the webhook must
--      verify the gross charge against what checkout actually initialized,
--      even if the fee schedule changes between the two.
--
--   2. `payment_apply_verified_payment` — fixes a latent money bug. Since the
--      checkout step started writing the `initialized` payments row (the
--      mapping the webhook needs), the function's "replayed reference" guard
--      matched that row and returned BEFORE applying anything: a verified
--      charge marked the payment row paid but never credited the installment.
--      The guard now only short-circuits a row that is already `paid`, which
--      is what idempotency means; the initialized row is the one this call
--      has to finalize. The function still receives the NET amount (the
--      webhook verifies the gross and passes the course portion), so the 0029
--      overpay guard is untouched.
--
-- Ghana's published Paystack schedule is 1.95% with no flat fee and no cap;
-- the app reads the rate from env (`PAYSTACK_FEE_*`) so a pricing change does
-- not need a migration. A database without this migration still checks out —
-- the app detects the missing column and absorbs the fee (charge = net).
--
-- Apply: Supabase Dashboard -> SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The fee the student paid on top of the course fee
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists fee_amount bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_fee_amount_nonnegative'
  ) then
    alter table public.payments
      add constraint payments_fee_amount_nonnegative check (fee_amount >= 0);
  end if;
end $$;

comment on column public.payments.fee_amount is
  'Paystack processing fee (pesewas) charged to the student ON TOP of amount. amount remains the money applied to the installment; the charge is amount + fee_amount.';

-- ---------------------------------------------------------------------------
-- 2. payment_apply_verified_payment — idempotency must mean "already paid"
-- ---------------------------------------------------------------------------

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
  -- Idempotency: a replayed webhook for a payment that has ALREADY been
  -- applied is a no-op. The row written at checkout initiation is
  -- 'initialized' — it must NOT short-circuit here, or the verified charge
  -- never reaches the installment.
  select id into v_payment_id
    from public.payments
    where paystack_reference = p_paystack_reference
      and status = 'paid'
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
  -- Overpay is a hard reject; underpay (a part payment) is accepted. The
  -- webhook passes the NET course amount (not the gross charge that includes
  -- the Paystack fee), so this guard keeps its original meaning.
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

comment on function public.payment_apply_verified_payment(uuid, uuid, text, bigint, text, text, jsonb) is
  'Applies a webhook-verified charge. p_amount is the NET course amount; the gross charge (amount + fee_amount) is verified by the webhook route before this call. Idempotent on an already-paid reference.';
