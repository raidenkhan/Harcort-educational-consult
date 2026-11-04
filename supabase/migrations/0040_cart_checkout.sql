-- ============================================================================
-- Harcourt Educational Consult — 0040: cart checkout
--
-- A student can now stash several of a tutor's courses (and other tutors'
-- courses) in a cart and pay for all of them in ONE Paystack charge. The
-- money still lands on each agreement individually — a batch is a payment
-- envelope, not a new ledger.
--
-- What changes:
--
--   1. `engagements.session_mode` — the format a cart booking was priced for.
--      Until now the format lived only on `tutor_requests`; a cart booking
--      has no request (payment IS the booking), so the agreement has to carry
--      the format itself. The verified-payment RPC now falls back to it when
--      no request exists, which is also what makes GROUP seating work for a
--      cart booking.
--
--   2. `payment_batches` — one row per checkout: the Paystack reference, the
--      NET total (what the agreements receive), the processing fee the
--      student paid on top, and the hosted-checkout URL for the double-tap
--      guard. `payment_batch_items` records which agreement got which slice.
--
--   3. `payments.batch_id` — every per-agreement ledger row points back at
--      the batch that produced it. Each item keeps its own unique reference
--      (`<batch>-B01`, …) because `payments.paystack_reference` is UNIQUE;
--      Paystack only ever sees the batch reference.
--
--   4. `prepare_cart_engagement` — find-or-create the unpaid agreement for a
--      (student, tutor_service) pair, re-priced to the format in the cart.
--      An agreement that already has money on it is never repriced.
--
--   5. `create_payment_batch` — atomically writes the batch, its items and
--      the per-item `payments` rows (status `initialized`). The amount is
--      re-checked against each agreement's outstanding balance under a row
--      lock, so the client can never invent a price.
--
--   6. `payment_apply_verified_batch` — applies a verified charge to every
--      item through the SAME `payment_apply_verified_payment` RPC the single
--      checkout uses, so activation, auto-accept, group seating and receipts
--      keep one implementation. Idempotent: a replayed batch returns without
--      touching the ledger.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) The agreement's own session format
-- ---------------------------------------------------------------------------

-- Nullable first so the backfill can tell "not set yet" from a real value,
-- then NOT NULL. Re-running never rewrites a cart engagement's format.
alter table public.engagements add column if not exists session_mode text;

update public.engagements e
   set session_mode = coalesce(
         (select tr.session_mode
            from public.tutor_requests tr
           where tr.student_id = e.student_id
             and tr.tutor_profile_id = e.tutor_profile_id
             and tr.course_id is not distinct from e.course_id
           order by tr.created_at desc
           limit 1),
         'one_on_one')
 where e.session_mode is null;

update public.engagements
   set session_mode = 'one_on_one'
 where session_mode is null;

alter table public.engagements alter column session_mode set default 'one_on_one';
alter table public.engagements alter column session_mode set not null;

alter table public.engagements drop constraint if exists engagements_session_mode_check;
do $$ begin
  alter table public.engagements
    add constraint engagements_session_mode_check
    check (session_mode in ('one_on_one', 'group'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2) Batch tables
-- ---------------------------------------------------------------------------

create table if not exists public.payment_batches (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles (id) on delete cascade,
  reference       text not null,
  amount          bigint not null check (amount > 0),          -- NET, pesewas
  fee_amount      bigint not null default 0 check (fee_amount >= 0),
  currency        text not null default 'GHS',
  status          text not null default 'initialized'
                  check (status in ('initialized', 'paid', 'failed', 'cancelled')),
  -- Stable hash of the cart's engagement+amount pairs. A second tap within
  -- ten minutes reuses the checkout page stored on the row instead of
  -- minting another live reference.
  signature       text,
  initialized_by  uuid references public.profiles (id) on delete set null,
  raw_payload     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  paid_at         timestamptz
);

create unique index if not exists idx_payment_batches_reference
  on public.payment_batches (reference);
create index if not exists idx_payment_batches_student
  on public.payment_batches (student_id, status);
create index if not exists idx_payment_batches_queue
  on public.payment_batches (status, created_at);

create table if not exists public.payment_batch_items (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references public.payment_batches (id) on delete cascade,
  engagement_id  uuid not null references public.engagements (id) on delete cascade,
  amount         bigint not null check (amount > 0),           -- NET slice, pesewas
  reference      text not null,
  idx            integer not null check (idx > 0),
  created_at     timestamptz not null default now(),
  unique (batch_id, engagement_id)
);

create unique index if not exists idx_payment_batch_items_reference
  on public.payment_batch_items (reference);
create index if not exists idx_payment_batch_items_engagement
  on public.payment_batch_items (engagement_id);

-- Deny-all RLS, like every other money table: the service-role client is the
-- only writer, and the RPCs are the only way money rows are created.
alter table public.payment_batches      enable row level security;
alter table public.payment_batch_items  enable row level security;

alter table public.payments add column if not exists batch_id uuid;

alter table public.payments drop constraint if exists payments_batch_id_fkey;
do $$ begin
  alter table public.payments
    add constraint payments_batch_id_fkey
    foreign key (batch_id) references public.payment_batches (id)
    on delete set null;
exception when duplicate_object then null; end $$;

create index if not exists idx_payments_batch
  on public.payments (batch_id)
  where batch_id is not null;

-- ---------------------------------------------------------------------------
-- 3) Find-or-create the agreement behind a cart line
-- ---------------------------------------------------------------------------

-- A cart line is one (student, tutor_service) pair in one format. The open
-- agreement unique index already guarantees at most one live row per pair,
-- so this either re-prices that unpaid quote or creates it. A quote with ANY
-- money on it is refused: a cart must never rewrite what was already bought.
create or replace function public.prepare_cart_engagement(
  actor_id           uuid,
  p_student_id       uuid,
  p_tutor_service_id uuid,
  p_session_mode     text default 'one_on_one'
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_service    record;
  v_engagement record;
  v_id         uuid;
  v_mode       text;
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

  v_total := round(v_price * 100)::bigint;
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

    -- Unpaid quote: re-price it to the format the cart is buying now. Safe
    -- because no money has landed, and the caller reads the total back.
    update public.engagements
       set agreed_total     = v_total,
           session_mode     = v_mode,
           course_id        = v_service.course_id,
           tutor_profile_id = v_service.tutor_profile_id,
           updated_at       = now()
     where id = v_engagement.id;

    return v_engagement.id;
  end if;

  insert into public.engagements (
    student_id, tutor_profile_id, course_id, tutor_service_id,
    agreed_total, status, paid_amount, session_mode
  ) values (
    p_student_id, v_service.tutor_profile_id, v_service.course_id,
    v_service.id, v_total, 'pending_payment', 0, v_mode
  )
  returning id into v_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_id, 'engagement.created', actor_id,
          case when actor_id = p_student_id then 'student' else 'admin' end,
          'app',
          jsonb_build_object('agreed_total', v_total,
                             'plan', 'cart',
                             'session_mode', v_mode,
                             'course_id', v_service.course_id));

  return v_id;
end;
$$;

comment on function public.prepare_cart_engagement(uuid, uuid, uuid, text) is
  'Find-or-create the UNPAID agreement for a cart line, re-priced to p_session_mode. Refuses an agreement that already has money on it (engagement_already_paid) so a cart can never rewrite a completed purchase.';

-- ---------------------------------------------------------------------------
-- 4) Create the batch + its per-item ledger rows, atomically
-- ---------------------------------------------------------------------------

-- `p_items` is a JSON array of { "engagement_id": uuid, "amount": bigint }.
-- The amount is re-checked against the agreement's live outstanding balance
-- under a row lock — the client only ever proposes, the database decides.
-- Per-item references are `<batch>-B01`, `<batch>-B02`, … so they are unique
-- in `payments` while Paystack only ever sees the batch reference.
create or replace function public.create_payment_batch(
  actor_id      uuid,
  p_student_id  uuid,
  p_reference   text,
  p_fee_amount  bigint,
  p_items       jsonb,
  p_signature   text default null
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_batch_id   uuid;
  v_item       record;
  v_engagement record;
  v_total      bigint := 0;
  v_currency   text;
  v_idx        integer := 0;
  v_count      integer;
  v_fee        bigint := coalesce(p_fee_amount, 0);
  v_fee_alloc  bigint := 0;
  v_item_fee   bigint;
  v_ref        text;
begin
  if actor_id is null then
    raise exception 'forbidden: actor required';
  end if;
  if actor_id <> p_student_id and not public.is_admin(actor_id) then
    raise exception 'forbidden: only the student or an admin can create a payment batch';
  end if;
  if p_reference is null or btrim(p_reference) = '' then
    raise exception 'reference_required';
  end if;
  if v_fee < 0 then
    raise exception 'invalid_fee';
  end if;
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'cart_empty';
  end if;

  v_count := jsonb_array_length(p_items);

  -- First pass: validate every line and total the NET amount.
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(engagement_id uuid, amount bigint)
  loop
    if v_item.engagement_id is null or v_item.amount is null or v_item.amount <= 0 then
      raise exception 'cart_item_invalid';
    end if;

    select * into v_engagement
      from public.engagements
     where id = v_item.engagement_id
     for update;

    if v_engagement.id is null then
      raise exception 'engagement_not_found';
    end if;
    if v_engagement.student_id <> p_student_id then
      raise exception 'forbidden: not your engagement';
    end if;
    if v_engagement.status <> 'pending_payment' then
      raise exception 'engagement_not_payable: %', v_engagement.status;
    end if;
    if v_item.amount > v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0) then
      raise exception 'amount_mismatch: agreement has % outstanding, got %',
        v_engagement.agreed_total - coalesce(v_engagement.paid_amount, 0), v_item.amount;
    end if;

    if v_currency is null then
      v_currency := v_engagement.currency;
    elsif v_currency <> v_engagement.currency then
      raise exception 'currency_mismatch';
    end if;

    v_total := v_total + v_item.amount;
  end loop;

  insert into public.payment_batches (
    student_id, reference, amount, fee_amount, currency, status, signature, initialized_by
  ) values (
    p_student_id, p_reference, v_total, v_fee, coalesce(v_currency, 'GHS'),
    'initialized', p_signature, actor_id
  )
  returning id into v_batch_id;

  -- Second pass: items + one `payments` row each. The fee is allocated in
  -- proportion to the net slice, with the rounding remainder on the last
  -- item, so the receipts add up to exactly what Paystack charged.
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(engagement_id uuid, amount bigint)
  loop
    v_idx := v_idx + 1;
    v_ref := p_reference || '-B' || lpad(v_idx::text, 2, '0');

    if v_idx = v_count then
      v_item_fee := v_fee - v_fee_alloc;
    else
      v_item_fee := (v_fee * v_item.amount) / v_total;
      v_fee_alloc := v_fee_alloc + v_item_fee;
    end if;

    insert into public.payment_batch_items (
      batch_id, engagement_id, amount, reference, idx
    ) values (
      v_batch_id, v_item.engagement_id, v_item.amount, v_ref, v_idx
    );

    insert into public.payments (
      engagement_id, amount, currency, paystack_reference, status,
      initialized_by, fee_amount, batch_id
    ) values (
      v_item.engagement_id, v_item.amount, coalesce(v_currency, 'GHS'),
      v_ref, 'initialized', actor_id, v_item_fee, v_batch_id
    );
  end loop;

  return v_batch_id;
end;
$$;

comment on function public.create_payment_batch(uuid, uuid, text, bigint, jsonb, text) is
  'Creates a cart batch, its items and the per-item initialized payments rows in one transaction. p_items is [{engagement_id, amount}]; each amount is re-checked against the agreement''s live outstanding balance under a lock.';

-- ---------------------------------------------------------------------------
-- 5) Verified-payment apply: engagement format fallback + batch receipt data
-- ---------------------------------------------------------------------------

-- Same signature as 0039. Two changes:
--   * the group format now falls back to `engagements.session_mode` when no
--     tutor_request exists (a cart booking has no request), so a cart group
--     booking is seated like any other;
--   * the student-facing receipt reads an optional batch reference + fee
--     share from `p_raw`, so a cart produces one accurate invoice per course
--     that quotes the Paystack reference the student actually paid.
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
  v_request_mode     text;
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
  -- bare "we got your money" note. For a CART item the caller passes the
  -- batch reference and this item's share of the processing fee in `p_raw`,
  -- so the student quotes the reference Paystack actually knows.
  v_payload := jsonb_build_object(
    'amount', p_amount,
    'reference', coalesce(nullif(p_raw->>'batch_reference', ''), p_paystack_reference),
    'fee_amount', coalesce(nullif(p_raw->>'batch_fee_share', '')::bigint, v_fee)
  );
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
  returning r.id, r.session_mode into v_request_id, v_request_mode;

  -- The format: the request that was just confirmed, else the agreement's
  -- own stored format (0040 — a cart booking has no request), else the
  -- default. Without this fallback a cart group booking would never seat.
  v_mode := coalesce(v_request_mode, v_engagement.session_mode, 'one_on_one');

  -- A group booking means the student belongs in the tutor's group for this
  -- course. Only the tutor's own non-archived group qualifies; if they haven't
  -- made one yet the booking still stands and they can add the student from
  -- the members sheet.
  if v_mode = 'group' then
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
  'Applies a Paystack-verified charge. p_amount is the NET course amount; the gross charge (amount + fee_amount) is verified by the caller before this call. p_installment_id may be NULL (0039 — a one-off payment settles the agreement itself). The group format falls back to engagements.session_mode when no tutor_request exists (0040 — cart bookings). Idempotent on an already-paid reference. A successful payment auto-accepts the matching pending tutor request (payment confirms the booking), and a GROUP booking seats the student in the tutor''s study group for that course. The student-facing outbox row carries the reference and fee so it can render as an invoice.';

-- ---------------------------------------------------------------------------
-- 6) Apply a verified batch charge
-- ---------------------------------------------------------------------------

create or replace function public.payment_apply_verified_batch(
  p_batch_id           uuid,
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
  v_batch       record;
  v_item        record;
  v_count       integer;
  v_idx         integer := 0;
  v_fee_alloc   bigint := 0;
  v_item_fee    bigint;
  v_item_raw    jsonb;
begin
  select * into v_batch
    from public.payment_batches
   where id = p_batch_id
   for update;

  if v_batch.id is null then
    raise exception 'batch_not_found';
  end if;
  if v_batch.status = 'paid' then
    return v_batch.id;
  end if;
  if v_batch.status <> 'initialized' then
    raise exception 'batch_not_payable: %', v_batch.status;
  end if;
  if p_paystack_reference <> v_batch.reference then
    raise exception 'reference_mismatch';
  end if;
  if p_currency <> v_batch.currency then
    raise exception 'currency_mismatch: expected %, got %', v_batch.currency, p_currency;
  end if;
  -- p_amount is the NET total. The caller has already verified that the gross
  -- charge Paystack took equals batch.amount + batch.fee_amount.
  if p_amount <> v_batch.amount then
    raise exception 'amount_mismatch: batch is %, got %', v_batch.amount, p_amount;
  end if;

  select count(*) into v_count
    from public.payment_batch_items
   where batch_id = p_batch_id;

  if v_count = 0 then
    raise exception 'batch_empty';
  end if;

  for v_item in
    select * from public.payment_batch_items
     where batch_id = p_batch_id
     order by idx
  loop
    v_idx := v_idx + 1;

    -- Fee share, with the rounding remainder on the last item.
    if v_idx = v_count then
      v_item_fee := v_batch.fee_amount - v_fee_alloc;
    else
      v_item_fee := (v_batch.fee_amount * v_item.amount) / v_batch.amount;
      v_fee_alloc := v_fee_alloc + v_item_fee;
    end if;

    v_item_raw := coalesce(p_raw, '{}'::jsonb) || jsonb_build_object(
      'batch_reference', v_batch.reference,
      'batch_fee_share', v_item_fee
    );

    -- The SAME apply the single checkout uses: activation, auto-accept,
    -- group seating, ledger events and receipts all stay in one place.
    perform public.payment_apply_verified_payment(
      v_item.engagement_id,
      null,
      v_item.reference,
      v_item.amount,
      p_currency,
      p_paystack_status,
      v_item_raw
    );
  end loop;

  update public.payment_batches
     set status = 'paid',
         paid_at = now(),
         updated_at = now(),
         raw_payload = coalesce(p_raw, raw_payload)
   where id = p_batch_id;

  return p_batch_id;
end;
$$;

comment on function public.payment_apply_verified_batch(uuid, text, bigint, text, text, jsonb) is
  'Applies one verified Paystack charge across every agreement in a cart batch. Idempotent (a paid batch returns immediately). Each item runs through payment_apply_verified_payment with the batch reference and its fee share so receipts quote the reference Paystack actually knows.';
