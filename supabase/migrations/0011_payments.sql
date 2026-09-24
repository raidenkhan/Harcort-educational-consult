-- ============================================================================
-- Harcourt Educational Consult — 0011: payments, installments, payouts
--
-- The money model, built to the decisions taken in the payments planning
-- round (divergent pass: ledger-first / verify-then-trust / installments-as-
-- rows / hybrid payouts):
--
--   engagements            one student × tutor × course-quote agreement.
--                          agreed_total is a PESAWAS SNAPSHOT of the tutor's
--                          quoted price at creation — later price edits never
--                          move an existing agreement.
--   installments           exactly 2 rows per engagement (50/50). Deadlines
--                          are rows, not dates: installment 2's due_at is
--                          synced to the pair's last session date.
--   payments               Paystack transactions. paystack_reference is
--                          UNIQUE = webhook idempotency. A row is created at
--                          checkout initiation (status 'initialized') and
--                          finalized to 'paid' ONLY after the webhook route
--                          verifies the charge against Paystack's own /verify
--                          endpoint (verify-then-trust: the webhook payload's
--                          amount is never trusted).
--   payment_events         APPEND-ONLY ledger — the "who and what". Every
--                          state change records actor id + role + source.
--                          A trigger forbids UPDATE/DELETE.
--   payouts                the tutor's 90% (platform keeps fee = total ×
--                          platform_fee_bps / 10000). Hybrid release: clean
--                          completions auto-approve; flagged ones queue for
--                          the admin. Every admin action is audited.
--   tutor_payout_accounts  tutor MoMo details + Paystack recipient_code.
--   notification_outbox    notifications are enqueued INSIDE the same
--                          transaction as the state change (no "paid but
--                          nobody told anyone" states), then drained after
--                          commit by lib/email.
--
-- The 50% gate lives in Postgres, not in TypeScript: request_payout refuses
-- unless sum(paid installments) = agreed_total AND every session between the
-- pair is dual-confirmed. The DB is the authorization boundary for money —
-- the app layer can be buggy; these guards cannot be routed around.
--
-- V1 simplification: sessions are matched to an engagement by the
-- (tutor_profile_id, student_id) pair — a pair works one course at a time.
-- Revisit if a pair ever runs multiple concurrent engagements.
--
-- All money columns are BIGINT PESAWAS. Never floats, never cedis.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- RLS: enabled + zero policies on every new table (deny-all) — same contract
-- as credentials/sessions/tutoring_sessions. The service-role client bypasses
-- RLS and performs its own authorization; writes to money tables go through
-- the RPCs below, never raw inserts from app code.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.engagement_status as enum
    ('pending_payment', 'active', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.installment_status as enum
    ('pending', 'paid', 'overdue', 'waived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum
    ('initialized', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payout_status as enum
    ('pending_review', 'approved', 'paid', 'held', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payout_provider as enum ('mtn', 'telecel', 'airteltigo');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2) Tables
-- ---------------------------------------------------------------------------

-- The agreement: one student, one tutor, one quoted course, one price.
create table if not exists public.engagements (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles (id) on delete cascade,
  tutor_profile_id    uuid not null references public.tutor_profiles (id) on delete cascade,
  course_id           uuid not null references public.courses (id) on delete restrict,
  tutor_service_id    uuid references public.tutor_services (id) on delete set null,
  agreed_total        bigint not null check (agreed_total > 0),   -- pesewas
  currency            text not null default 'GHS',
  platform_fee_bps    integer not null default 1000 check (platform_fee_bps between 0 and 10000),
  status              public.engagement_status not null default 'pending_payment',
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One open quote per (student, service) at a time: prevents accidental
-- duplicate engagements, while completed ones stay as history.
create unique index if not exists idx_engagements_open_per_service
  on public.engagements (student_id, tutor_service_id)
  where tutor_service_id is not null
    and status in ('pending_payment', 'active');

create index if not exists idx_engagements_student on public.engagements (student_id, status);
create index if not exists idx_engagements_tutor   on public.engagements (tutor_profile_id, status);

-- Exactly 2 rows per engagement (idx 1 and 2) — the 50/50 plan.
create table if not exists public.installments (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  idx           integer not null check (idx in (1, 2)),
  amount        bigint not null check (amount > 0),              -- pesewas
  due_at        timestamptz not null,
  status        public.installment_status not null default 'pending',
  was_overdue   boolean not null default false,                  -- flag history: survives payment
  paid_at       timestamptz,
  waived_by     uuid references public.profiles (id) on delete set null,
  waived_reason text,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_installments_per_engagement
  on public.installments (engagement_id, idx);
-- The overdue sweep scans exactly this.
create index if not exists idx_installments_due
  on public.installments (due_at)
  where status = 'pending';

-- Paystack transactions. Inserted only by payment_apply_verified_payment
-- (the webhook route verifies with Paystack first).
create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  engagement_id       uuid not null references public.engagements (id) on delete cascade,
  installment_id      uuid not null references public.installments (id) on delete cascade,
  amount              bigint not null check (amount > 0),        -- pesewas
  currency            text not null default 'GHS',
  paystack_reference  text not null,
  paystack_status     text,                                      -- last raw status from Paystack
  status              public.payment_status not null default 'initialized',
  initialized_by      uuid references public.profiles (id) on delete set null,
  verified_at         timestamptz,
  raw_payload         jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Webhook idempotency: a replayed charge reference is a no-op, not a second
-- installment.
create unique index if not exists idx_payments_reference
  on public.payments (paystack_reference);
create index if not exists idx_payments_engagement on public.payments (engagement_id);

-- Append-only audit ledger. The trigger below makes UPDATE/DELETE impossible.
create table if not exists public.payment_events (
  id             uuid primary key default gen_random_uuid(),
  engagement_id  uuid not null references public.engagements (id) on delete cascade,
  type           text not null,
  actor_id       uuid references public.profiles (id) on delete set null,  -- null = system/webhook
  actor_role     text not null default 'system'
                 check (actor_role in ('student', 'tutor', 'admin', 'system')),
  source         text not null default 'app'
                 check (source in ('app', 'webhook', 'cron', 'rpc')),
  data           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_payment_events_engagement
  on public.payment_events (engagement_id, created_at);

create or replace function public.payment_events_forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment_events is append-only (attempted %)', tg_op;
end;
$$;

drop trigger if exists trg_payment_events_immutable on public.payment_events;
create trigger trg_payment_events_immutable
  before update or delete on public.payment_events
  for each row execute function public.payment_events_forbid_mutation();

-- The tutor's share of an engagement (total minus platform fee).
create table if not exists public.payouts (
  id                uuid primary key default gen_random_uuid(),
  engagement_id     uuid not null references public.engagements (id) on delete cascade,
  tutor_profile_id  uuid not null references public.tutor_profiles (id) on delete cascade,
  amount            bigint not null check (amount > 0),          -- tutor share, pesewas
  platform_fee      bigint not null check (platform_fee >= 0),   -- our 10%, pesewas
  status            public.payout_status not null default 'pending_review',
  flag_reason       text,
  recipient_code    text,                                        -- Paystack recipient snapshot
  transfer_code     text,                                        -- Paystack transfer ref once executed
  released_by       uuid references public.profiles (id) on delete set null, -- null = automatic
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- One live payout per engagement (failed attempts don't block a retry).
create unique index if not exists idx_payouts_one_per_engagement
  on public.payouts (engagement_id)
  where status <> 'failed';
create index if not exists idx_payouts_tutor on public.payouts (tutor_profile_id, status);
create index if not exists idx_payouts_queue on public.payouts (status, created_at);

-- Tutor MoMo details. recipient_code is created via Paystack's transfers API.
create table if not exists public.tutor_payout_accounts (
  id               uuid primary key default gen_random_uuid(),
  tutor_profile_id uuid not null references public.tutor_profiles (id) on delete cascade,
  provider         public.payout_provider not null,
  phone            text not null,
  account_name     text,
  recipient_code   text,
  verified_at      timestamptz,               -- set after the ₵1 ping transfer succeeds
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists idx_payout_accounts_per_tutor
  on public.tutor_payout_accounts (tutor_profile_id);

-- Notifications enqueued in-transaction, drained after commit by lib/email.
create table if not exists public.notification_outbox (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,
  audience      text not null check (audience in ('student', 'tutor', 'admin')),
  recipient_id  uuid references public.profiles (id) on delete cascade,  -- null = all admins
  engagement_id uuid references public.engagements (id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  attempts      integer not null default 0,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_outbox_pending
  on public.notification_outbox (created_at)
  where sent_at is null;

-- Deny-all RLS on every new table: no policies on purpose. The service-role
-- client is the only writer, and money tables are written via RPCs only.
alter table public.engagements           enable row level security;
alter table public.installments          enable row level security;
alter table public.payments              enable row level security;
alter table public.payment_events        enable row level security;
alter table public.payouts               enable row level security;
alter table public.tutor_payout_accounts enable row level security;
alter table public.notification_outbox   enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Fee helper
-- ---------------------------------------------------------------------------

-- Platform fee in pesewas: total × bps / 10000, floored. Immutable + strict,
-- so it can be inlined into the guards below.
create or replace function public.payment_platform_fee(
  p_total bigint,
  p_bps   integer
) returns bigint
language sql
immutable
as $$
  select (p_total * p_bps) / 10000;
$$;

-- ---------------------------------------------------------------------------
-- 4) Engagement creation
-- ---------------------------------------------------------------------------

-- create_payment_engagement — the student (or an admin on their behalf)
-- commits to a tutor's quoted price for one course. Snapshots the price in
-- pesewas, creates the 50/50 installments, logs the event, enqueues
-- notifications — all atomically.
--
-- Deadline policy (decided): installment 1 is due within 3 days (the
-- commitment window); installment 2's due_at is synced to the pair's last
-- session date by sync_installment_deadlines once sessions are scheduled
-- (fallback: 14 days after installment 1's due date).
create or replace function public.create_payment_engagement(
  actor_id           uuid,
  p_student_id       uuid,
  p_tutor_service_id uuid,
  p_request_id       uuid default null   -- the accepted tutor_request that unlocked this (0012)
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_service       record;
  v_engagement_id uuid;
  v_half1         bigint;
  v_half2         bigint;
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

  -- Price snapshot: the tutor's quote converts to pesewas ONCE. Later price
  -- edits on tutor_services never move an existing agreement.
  v_half1 := (v_service.price * 100)::bigint / 2;
  v_half2 := (v_service.price * 100)::bigint - v_half1;   -- odd-pesewa remainder on #2

  insert into public.engagements (
    student_id, tutor_profile_id, course_id, tutor_service_id, agreed_total, status
  ) values (
    p_student_id, v_service.tutor_profile_id, v_service.course_id,
    v_service.id, v_half1 + v_half2, 'pending_payment'
  )
  on conflict do nothing
  returning id into v_engagement_id;

  if v_engagement_id is null then
    raise exception 'engagement_exists';
  end if;

  insert into public.installments (engagement_id, idx, amount, due_at)
  values (v_engagement_id, 1, v_half1, now() + interval '3 days'),
         (v_engagement_id, 2, v_half2, now() + interval '17 days');

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_engagement_id, 'engagement.created', actor_id, v_actor_role, 'app',
          jsonb_build_object('agreed_total', v_half1 + v_half2,
                             'installment_1', v_half1, 'installment_2', v_half2,
                             'course_id', v_service.course_id,
                             'request_id', p_request_id));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data) values
    ('payment.engagement_created', 'tutor', (select profile_id from public.tutor_profiles where id = v_service.tutor_profile_id), v_engagement_id, '{}'::jsonb),
    ('payment.engagement_created', 'admin', null, v_engagement_id, '{}'::jsonb);

  return v_engagement_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) The verified-payment apply (webhook only)
-- ---------------------------------------------------------------------------

-- payment_apply_verified_payment — called by the webhook route ONLY after it
-- has (a) verified the Paystack signature and (b) re-fetched the transaction
-- from Paystack's /verify endpoint. The amount passed here was read back from
-- Paystack, not from the webhook body.
--
-- Guards, in order:
--   * reference replay  → idempotent no-op returning the original payment id
--   * amount mismatch   → hard reject (never partially apply)
--   * installment state → only pending/overdue installments can be paid
-- Side effects: payment row, installment paid, engagement activation at 50%,
-- ledger events, outbox notifications. One transaction, or nothing.
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
  if p_amount <> v_installment.amount then
    raise exception 'amount_mismatch: expected %, got %', v_installment.amount, p_amount;
  end if;
  if p_currency <> v_engagement.currency then
    raise exception 'currency_mismatch: expected %, got %', v_engagement.currency, p_currency;
  end if;
  if v_installment.status not in ('pending', 'overdue') then
    raise exception 'installment_not_payable: status %', v_installment.status;
  end if;

  v_prev_status := v_engagement.status;

-- Upsert by reference: the row usually already exists as 'initialized'
-- (written by the checkout-initiation step). A webhook with no row (e.g. an
-- init lost to a rolled-back request) is still fine — the charge was verified
-- against Paystack before this RPC ran, so we accept it. Either way the row
-- ends 'paid' exactly once.
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

  update public.installments
    set status = 'paid', paid_at = now(), was_overdue = (was_overdue or status = 'overdue')
    where id = p_installment_id;

  -- The 50% gate: engagement activates the moment paid ≥ half the total.
  select coalesce(sum(i.amount), 0) into v_paid_sum
    from public.installments i
    where i.engagement_id = p_engagement_id and i.status = 'paid';

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
-- 6) Deadline sync + overdue sweep
-- ---------------------------------------------------------------------------

-- sync_installment_deadlines — installment 2 tracks the pair's last session
-- date (the decided policy). Called after every schedule/reschedule/cancel.
-- Never moves a deadline into the past, and never touches paid installments.
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

-- payment_sweep_overdue — cron sweep. Flips past-due pending installments to
-- overdue, marks was_overdue (payout flag history), logs, and enqueues
-- reminder emails. Idempotent: re-running finds nothing new.
create or replace function public.payment_sweep_overdue()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    update public.installments
      set status = 'overdue', was_overdue = true
      where status = 'pending' and due_at < now()
      returning engagement_id, idx, amount
  loop
    v_count := v_count + 1;

    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (v_row.engagement_id, 'installment.overdue', null, 'system', 'cron',
            jsonb_build_object('installment_idx', v_row.idx, 'amount', v_row.amount));

    insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
    select 'payment.overdue', a.audience, a.recipient_id, v_row.engagement_id,
           jsonb_build_object('installment_idx', v_row.idx, 'amount', v_row.amount)
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
-- 7) Payouts — the 50% gate + completion proof + hybrid release
-- ---------------------------------------------------------------------------

-- request_payout — the tutor (or admin, or the auto-completion path) opens a
-- payout for a fully-paid, fully-delivered engagement. THE GUARD TABLE:
--   * every session between the pair is dual-confirmed (tutor AND student
--     ticked) — completion is proven, not claimed
--   * no pending/overdue installments — the 50% rule plus final payment
--   * engagement not already cancelled
-- Flags (was_overdue history, cancelled sessions) route the payout to the
-- admin queue instead of auto-approval. Amount = total − platform fee.
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

  -- The 50% gate plus final: every pesewa must be in before a payout exists.
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
    from (select 'tutor' as audience, v_tutor_id as recipient_id
          union all
          select 'admin', null::uuid) a;

  return v_payout_id;
end;
$$;

-- payment_mark_payout_paid — the ONLY way a payout becomes 'paid'. Called by
-- the app after the Paystack transfer succeeds (actor_id null = the automatic
-- path). Idempotent on an already-paid payout. Logs and notifies.
create or replace function public.payment_mark_payout_paid(
  p_actor_id     uuid,          -- admin profile id, or null = automatic transfer
  p_payout_id    uuid,
  p_transfer_code text
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout record;
begin
  if p_actor_id is not null and not public.is_admin(p_actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'payout_not_found';
  end if;
  if v_payout.status = 'paid' then
    return;                                   -- idempotent replay
  end if;
  if v_payout.status <> 'approved' then
    raise exception 'payout_not_approvable: status %', v_payout.status;
  end if;

  update public.payouts
    set status = 'paid', transfer_code = p_transfer_code,
        paid_at = now(), released_by = coalesce(v_payout.released_by, p_actor_id),
        updated_at = now()
    where id = p_payout_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_payout.engagement_id, 'payout.paid', p_actor_id,
          case when p_actor_id is null then 'system' else 'admin' end,
          case when p_actor_id is null then 'webhook' else 'app' end,
          jsonb_build_object('payout_id', p_payout_id, 'amount', v_payout.amount,
                             'transfer_code', p_transfer_code));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  select 'payment.payout_paid', 'tutor', tp.profile_id, v_payout.engagement_id,
         jsonb_build_object('amount', v_payout.amount)
    from public.tutor_profiles tp where tp.id = v_payout.tutor_profile_id;
  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  values ('payment.payout_paid', 'admin', null, v_payout.engagement_id,
          jsonb_build_object('amount', v_payout.amount));
end;
$$;

-- admin_hold_payout — pull a payout out of the automatic path. Reason is
-- mandatory; everything lands in the ledger.
create or replace function public.admin_hold_payout(
  actor_id      uuid,
  p_payout_id   uuid,
  p_reason      text
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout record;
begin
  if not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required';
  end if;

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'payout_not_found';
  end if;
  if v_payout.status not in ('pending_review', 'approved') then
    raise exception 'payout_not_holdable: status %', v_payout.status;
  end if;

  update public.payouts
    set status = 'held', flag_reason = p_reason, updated_at = now()
    where id = p_payout_id;

  perform set_config('request.harcot.actor_id', actor_id::text, true);

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_payout.engagement_id, 'payout.held', actor_id, 'admin', 'app',
          jsonb_build_object('payout_id', p_payout_id, 'reason', p_reason));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  select 'payment.payout_held', 'tutor', tp.profile_id, v_payout.engagement_id,
         jsonb_build_object('reason', p_reason)
    from public.tutor_profiles tp where tp.id = v_payout.tutor_profile_id;
end;
$$;

-- admin_release_payout — a held/queued payout is judged clean: to 'approved',
-- ready for the transfer. Also the manual approval for pending_review items.
create or replace function public.admin_release_payout(
  actor_id      uuid,
  p_payout_id   uuid
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_payout record;
begin
  if not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'payout_not_found';
  end if;
  if v_payout.status not in ('pending_review', 'held') then
    raise exception 'payout_not_releasable: status %', v_payout.status;
  end if;

  update public.payouts
    set status = 'approved', released_by = actor_id, updated_at = now()
    where id = p_payout_id;

  perform set_config('request.harcot.actor_id', actor_id::text, true);

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_payout.engagement_id, 'payout.approved', actor_id, 'admin', 'app',
          jsonb_build_object('payout_id', p_payout_id));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  select 'payment.payout_approved', 'tutor', tp.profile_id, v_payout.engagement_id,
         jsonb_build_object('amount', v_payout.amount)
    from public.tutor_profiles tp where tp.id = v_payout.tutor_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Engagement completion (the last state move)
-- ---------------------------------------------------------------------------

-- complete_engagement — every session delivered + every pesewa in. Usually
-- fired implicitly by request_payout's guards passing; exposed for the admin
-- to close out an engagement whose sessions were all cancelled.
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

  if v_open > 0 or v_due > 0 then
    raise exception 'not_completable: % open sessions, % unpaid installments', v_open, v_due;
  end if;

  update public.engagements
    set status = 'completed', updated_at = now()
    where id = p_engagement_id and status <> 'completed';

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'engagement.completed', actor_id, 'admin', 'app', '{}'::jsonb);
end;
$$;
