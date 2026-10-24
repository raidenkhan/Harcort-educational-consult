-- ============================================================================
-- Harcourt — 0032 Payment plans: promised dates + part-payment links
--
-- 0029 could record a part payment, but only against an EXISTING agreement,
-- and a student who cannot pay in full never gets one: they hit the paywall,
-- ask the admin for a plan, and the flow dead-ends. This migration closes the
-- loop:
--
--   1. `engagements.expected_full_payment_at` — the date the admin and the
--      student agreed the balance will be settled. The admin sets it when
--      opening the plan and can move it later; the student sees it on the
--      paywall, and an overdue promise is flagged in the console.
--
--   2. `payment_requests` — an admin-issued PART-PAYMENT LINK. The admin
--      chooses an amount (e.g. half now), the app emails/WhatsApps the
--      student a one-time URL, and the student pays that exact amount through
--      Paystack. The token is stored as a SHA-256 HASH (same rule as
--      password-reset codes and sessions): a database leak cannot be turned
--      into working payment links. Each link is single-use.
--
--   3. `payments.payment_request_id` — ties the Paystack charge back to the
--      link that produced it, so the webhook can mark the link paid in the
--      same transaction that applies the money.
--
-- Nothing here moves money by itself: a link only allows the student to pay
-- an amount the admin already approved, and `payment_apply_verified_payment`
-- (0029) still re-checks the amount against the installment under a lock.
--
-- Apply: Supabase Dashboard -> SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The promise: when the balance will be settled
-- ---------------------------------------------------------------------------

alter table public.engagements
  add column if not exists expected_full_payment_at date;

comment on column public.engagements.expected_full_payment_at is
  'Date the admin and student agreed the outstanding balance will be paid. NULL = no promise made.';

-- ---------------------------------------------------------------------------
-- 2. Part-payment links
-- ---------------------------------------------------------------------------

create table if not exists public.payment_requests (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements (id) on delete cascade,
  -- SHA-256 of the token in the URL. The raw token is shown once, to the
  -- admin who created it, and never stored.
  token_hash    text not null,
  amount        bigint not null check (amount > 0),   -- pesewas
  note          text check (note is null or char_length(note) <= 280),
  status        text not null default 'open'
                check (status in ('open', 'paid', 'cancelled')),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  paid_at       timestamptz
);

create unique index if not exists idx_payment_requests_token
  on public.payment_requests (token_hash);

create index if not exists idx_payment_requests_engagement
  on public.payment_requests (engagement_id, created_at desc);

-- Deny-all RLS, like every other private table: only the service-role client
-- (behind an explicit admin/student check in the app) reads or writes this.
alter table public.payment_requests enable row level security;

comment on table public.payment_requests is
  'Admin-issued single-use part-payment links. token_hash = SHA-256 of the URL token.';
comment on column public.payment_requests.amount is
  'Pesewas the student is allowed to pay through this link (never more than the outstanding balance at creation time).';

-- The webhook needs to know which link a verified charge settles.
alter table public.payments add column if not exists payment_request_id uuid
  references public.payment_requests (id) on delete set null;

create index if not exists idx_payments_request
  on public.payments (payment_request_id)
  where payment_request_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- The admin opens a plan for a student who cannot pay the full fee up front:
-- records the promised date and leaves an audit trail.
create or replace function public.admin_set_payment_promise(
  actor_id        uuid,
  p_engagement_id uuid,
  p_date          date
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_engagement record;
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select id, status into v_engagement
    from public.engagements
    where id = p_engagement_id
    for update;
  if v_engagement.id is null then
    raise exception 'engagement_not_found';
  end if;
  if v_engagement.status = 'cancelled' then
    raise exception 'engagement_cancelled';
  end if;

  update public.engagements
    set expected_full_payment_at = p_date,
        updated_at = now()
    where id = p_engagement_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'engagement.promise_set', actor_id, 'admin', 'app',
          jsonb_build_object('expected_full_payment_at', p_date));
end;
$$;

-- Create a part-payment link. The token is generated in the app (the raw
-- value must never reach the database); this function only stores its hash
-- and re-checks the amount against the live outstanding balance under a lock,
-- so an admin cannot issue a link for more than the student owes.
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

  select coalesce(sum(i.amount - i.paid_amount), 0) into v_outstanding
    from public.installments i
    where i.engagement_id = p_engagement_id
      and i.status in ('pending', 'overdue');

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

-- Cancel an open link (the student never paid it, or the admin issued a new
-- one). Paid links are immutable — the money row is the record.
create or replace function public.admin_cancel_payment_request(
  actor_id          uuid,
  p_payment_request uuid
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request record;
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_request
    from public.payment_requests
    where id = p_payment_request
    for update;
  if v_request.id is null then
    raise exception 'payment_request_not_found';
  end if;
  if v_request.status <> 'open' then
    raise exception 'payment_request_not_open';
  end if;

  update public.payment_requests
    set status = 'cancelled'
    where id = p_payment_request;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_request.engagement_id, 'payment_request.cancelled', actor_id, 'admin', 'app',
          jsonb_build_object('payment_request_id', p_payment_request));
end;
$$;
