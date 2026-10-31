-- Harcourt Educational Consult — 0038: payment = invoice + group seat
--
-- Two things a successful payment should do, both inside the same transaction
-- that applies the money (the 0035 rule: payment IS the booking).
--
--   1. INVOICE. The student's "payment received" email carried only the net
--      amount, so it could not be a receipt: no fee, no total charged, no
--      Paystack reference to quote in a dispute. The outbox payload now
--      carries `reference` and `fee_amount` (both already on the payments row
--      — the fee is written at checkout and preserved by the upsert below), so
--      the email can itemise what was actually charged.
--
--   2. GROUP SEAT. A student who booked GROUP sessions was auto-accepted by
--      0035 but still had to be added to the tutor's study group by hand, so a
--      group booking left them outside the group. When the auto-accepted
--      request was `session_mode = 'group'`, the student is now seated in the
--      tutor's non-archived group for that course, a line appears in the feed,
--      and the tutor is notified. `study_group_members` is written BEFORE the
--      message so 0036's `last_read_at` default (now()) leaves that line
--      unread for the student who just joined.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.

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
  v_prev_status      text;
  v_paid_sum         bigint;
  v_engagement       record;
  v_fee              bigint;
  v_tutor_profile_id uuid;
  v_request_id       uuid;
  v_mode             text;
  v_group_id         uuid;
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
  -- caller passes the NET course amount (not the gross charge that includes
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

  -- The fee checkout charged the student, preserved by the upsert above. It
  -- is what turns the "payment received" email into an itemised invoice.
  select fee_amount into v_fee from public.payments where id = v_payment_id;

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

    -- The tutor recipient is the TUTOR's profile — 0034 pointed this at the
    -- student, so the tutor never got the activation email.
    insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
      ('payment.engagement_activated', 'tutor',
        (select tp.profile_id from public.tutor_profiles tp where tp.id = v_engagement.tutor_profile_id),
        p_engagement_id, '{}'::jsonb),
      ('payment.engagement_activated', 'admin', null, p_engagement_id, '{}'::jsonb);
  end if;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'installment.paid', null, 'system', 'webhook',
          jsonb_build_object('installment_idx', v_installment.idx,
                             'amount', p_amount,
                             'installment_paid_amount', v_installment.paid_amount + p_amount,
                             'reference', p_paystack_reference));

  -- The reference and fee are what let the student-facing row be a real
  -- invoice (course, fee, total charged, reference to quote) rather than a
  -- bare "we got your money" note.
  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.received', 'student', v_engagement.student_id, p_engagement_id,
      jsonb_build_object('installment_idx', v_installment.idx, 'amount', p_amount,
                         'reference', p_paystack_reference, 'fee_amount', v_fee)),
    ('payment.received', 'tutor',
      (select tp.profile_id from public.tutor_profiles tp where tp.id = v_engagement.tutor_profile_id),
      p_engagement_id,
      jsonb_build_object('installment_idx', v_installment.idx, 'amount', p_amount,
                         'reference', p_paystack_reference, 'fee_amount', v_fee)),
    ('payment.received', 'admin', null, p_engagement_id,
      jsonb_build_object('installment_idx', v_installment.idx, 'amount', p_amount,
                         'reference', p_paystack_reference, 'fee_amount', v_fee));

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
  'Applies a Paystack-verified charge. p_amount is the NET course amount; the gross charge (amount + fee_amount) is verified by the caller before this call. Idempotent on an already-paid reference. A successful payment auto-accepts the matching pending tutor request (payment confirms the booking), and a GROUP booking seats the student in the tutor''s study group for that course. The student-facing outbox row carries the reference and fee so it can render as an invoice.';
