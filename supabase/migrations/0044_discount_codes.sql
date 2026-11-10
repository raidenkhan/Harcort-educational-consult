-- ============================================================================
-- Harcourt — 0044 · Discount codes
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
-- Requires 0039 (engagement paid_amount) and 0040 (cart batches).
--
-- An admin creates a PERSONAL, SINGLE-USE percentage discount for one student
-- (Admin → Discount codes). The student enters it at checkout and pays the
-- discounted amount; HARCOURT absorbs the discount — the agreement keeps its
-- full price, so the tutor's share is unchanged — via a Harcourt-funded
-- credit applied when the real Paystack payment is verified.
--
--   discount_codes        the code, its percent, the ONE student it's for
--   discount_redemptions  the checkout a code was used on: the Paystack
--                         reference and how much credit goes to each
--                         agreement. UNIQUE(code_id) = single use. `status`
--                         'pending' → 'applied' is the atomic claim that makes
--                         the credit land exactly once even though the
--                         webhook, the return path and the sweep can all
--                         reconcile the same payment.
--   apply_discount_credit the credit itself: a `payments` row with a
--                         DISCOUNT-… reference (paystack_status 'discount'),
--                         spread across the agreement's open installments like
--                         any payment, activating a pending agreement. No
--                         receipt emails — the student was never charged it.
--
-- Deny-all RLS on both tables (service-role client only, like every private
-- table).
-- ============================================================================

create table if not exists public.discount_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null check (char_length(code) between 4 and 40),
  percent     integer not null check (percent between 1 and 100),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null default 'active' check (status in ('active', 'used', 'revoked')),
  expires_at  timestamptz,
  note        text check (char_length(note) <= 300),
  created_by  uuid references public.profiles (id) on delete set null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Codes are matched case-insensitively.
create unique index if not exists idx_discount_codes_code
  on public.discount_codes (upper(code));
create index if not exists idx_discount_codes_student
  on public.discount_codes (student_id, created_at desc);

create table if not exists public.discount_redemptions (
  id               uuid primary key default gen_random_uuid(),
  code_id          uuid not null references public.discount_codes (id) on delete cascade,
  student_id       uuid not null references public.profiles (id) on delete cascade,
  reference        text not null,
  percent          integer not null,
  discount_amount  bigint not null check (discount_amount >= 0),
  allocations      jsonb not null default '[]'::jsonb,
  status           text not null default 'pending' check (status in ('pending', 'applied')),
  applied_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Single use: one redemption per code (an abandoned checkout's pending row is
-- re-pointed at the next attempt instead of creating a second).
create unique index if not exists idx_discount_redemptions_code
  on public.discount_redemptions (code_id);
create index if not exists idx_discount_redemptions_reference
  on public.discount_redemptions (reference);

alter table public.discount_codes       enable row level security;
alter table public.discount_redemptions enable row level security;

-- ---------------------------------------------------------------------------
-- The Harcourt-funded credit
-- ---------------------------------------------------------------------------

create or replace function public.apply_discount_credit(
  p_engagement_id uuid,
  p_amount        bigint,
  p_code_id       uuid
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
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount_mismatch: discount must be positive';
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
  if p_amount > v_outstanding then
    raise exception 'amount_exceeds_outstanding: % owed, got %', v_outstanding, p_amount;
  end if;

  v_prev_status := v_engagement.status;
  v_reference := 'DISCOUNT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  select id into v_first_open
    from public.installments
   where engagement_id = p_engagement_id
     and status in ('pending', 'overdue')
   order by idx
   limit 1;

  insert into public.payments (
    engagement_id, installment_id, amount, currency, paystack_reference,
    paystack_status, status, verified_at, raw_payload
  ) values (
    p_engagement_id, v_first_open, p_amount, v_engagement.currency, v_reference,
    'discount', 'paid', now(),
    jsonb_build_object('source', 'discount', 'discount_code_id', p_code_id, 'funded_by', 'harcourt')
  )
  returning id into v_payment_id;

  -- Spread across the schedule, oldest part first (same as any payment).
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

  -- The discount is applied together with (or instead of, for 100%) the
  -- student's real payment, so a pending agreement is confirmed now.
  update public.engagements
    set paid_amount = coalesce(v_engagement.paid_amount, 0) + p_amount,
        status = case
          when v_prev_status = 'pending_payment' then 'active'::public.engagement_status
          else status end,
        updated_at = now()
    where id = p_engagement_id;

  if v_prev_status = 'pending_payment' then
    insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
    values (p_engagement_id, 'engagement.activated', null, 'system', 'rpc',
            jsonb_build_object('paid_pesewas', p_amount, 'reason', 'discount_applied'));
  end if;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (p_engagement_id, 'payment.discount_applied', null, 'system', 'rpc',
          jsonb_build_object('payment_id', v_payment_id, 'amount', p_amount,
                             'reference', v_reference, 'discount_code_id', p_code_id));

  return v_payment_id;
end;
$$;

revoke all on function public.apply_discount_credit(uuid, bigint, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
