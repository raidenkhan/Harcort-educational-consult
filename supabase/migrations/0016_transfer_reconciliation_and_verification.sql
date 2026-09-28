-- ============================================================================
-- Harcourt Educational Consult — 0016: transfer reconciliation + payout
-- account verification (run AFTER 0015)
--
-- Closes the two payout dead ends found in the payments audit (2026-09-28):
--
--   1. TRANSFER RECONCILIATION. adminExecutePayout marked payouts 'paid' the
--      moment Paystack accepted the transfer request — but MoMo transfers
--      are async (status 'pending'), and the webhook ignored transfer.*
--      events. A failed transfer left DB=paid / tutor=unpaid with no
--      recovery. This migration:
--        - records the transfer_code at INITIATION (payment_record_transfer),
--          flipping approved → 'transferring' so the queue shows "in flight";
--        - lets the webhook finalize the outcome:
--              transfer.success → payment_mark_payout_paid (idempotent)
--              transfer.failed / reversed → payment_mark_payout_failed
--              (status → 'failed'; the one-per-engagement partial index
--              permits a retry payout);
--        - lets the sweep requery stuck transfers (payment_requery_transfers)
--          so a missed webhook self-heals;
--        - WIDENS payment_mark_payout_paid to also accept 'transferring' —
--          the 0011 version only accepted 'approved', so a webhook could
--          never finalize an in-flight transfer.
--
--   2. PAYOUT ACCOUNT VERIFICATION. savePayoutAccount stores verified_at
--      null and NOTHING ever set it, so request_payout always failed with
--      payout_account_unverified — tutors could never request their payout.
--      New admin_verify_payout_account RPC (admin-only, audited) sets it;
--      an admin section lists every saved account with verify actions.
--
-- Requires: 0015 (payout_status 'transferring') already applied + committed.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) payment_record_transfer — record an initiated transfer, approved →
--    'transferring'. Actor must be an admin (the app passes the acting
--    admin's profile id).
-- ---------------------------------------------------------------------------
create or replace function public.payment_record_transfer(
  p_actor_id     uuid,
  p_payout_id    uuid,
  p_transfer_code text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout record;
begin
  if p_actor_id is null or not public.is_admin(p_actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_payout from public.payouts where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'payout_not_found';
  end if;
  if v_payout.status = 'transferring' then
    return;  -- idempotent replay (same or raced initiation)
  end if;
  if v_payout.status not in ('approved', 'transferring') then
    raise exception 'payout_not_approvable: status %', v_payout.status;
  end if;

  update public.payouts
    set transfer_code = p_transfer_code,
        status = 'transferring',
        updated_at = now()
    where id = p_payout_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_payout.engagement_id, 'payout.transfer_initiated', p_actor_id, 'admin', 'app',
          jsonb_build_object('payout_id', p_payout_id,
                             'transfer_code', p_transfer_code,
                             'amount', v_payout.amount));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  select 'payment.payout_transferring', 'tutor', tp.profile_id, v_payout.engagement_id,
         jsonb_build_object('amount', v_payout.amount)
    from public.tutor_profiles tp where tp.id = v_payout.tutor_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) payment_mark_payout_failed — transfer.failed / reversed landing pad.
--    Only a payout in 'transferring' can fail (an approved payout was never
--    sent). Marks the payout 'failed'; the partial unique index
--    idx_payouts_one_per_engagement excludes 'failed', so the tutor (or
--    admin) can request a fresh payout which will pass request_payout.
-- ---------------------------------------------------------------------------
create or replace function public.payment_mark_payout_failed(
  p_actor_id     uuid,   -- admin profile id, or null = webhook/system
  p_payout_id    uuid,
  p_reason       text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payout record;
begin
  select * into v_payout from public.payouts where id = p_payout_id for update;
  if v_payout.id is null then
    raise exception 'payout_not_found';
  end if;
  if v_payout.status = 'failed' then
    return;  -- idempotent replay
  end if;
  if v_payout.status <> 'transferring' then
    raise exception 'payout_not_cancellable: status %', v_payout.status;
  end if;

  update public.payouts
    set status = 'failed',
        flag_reason = coalesce(p_reason, flag_reason),
        updated_at = now()
    where id = p_payout_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_payout.engagement_id, 'payout.failed', p_actor_id,
          case when p_actor_id is null then 'system' else 'admin' end,
          case when p_actor_id is null then 'webhook' else 'app' end,
          jsonb_build_object('payout_id', p_payout_id,
                             'reason', p_reason,
                             'transfer_code', v_payout.transfer_code));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  select 'payment.payout_failed', 'tutor', tp.profile_id, v_payout.engagement_id,
         jsonb_build_object('amount', v_payout.amount, 'reason', p_reason)
    from public.tutor_profiles tp where tp.id = v_payout.tutor_profile_id;
  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  values ('payment.payout_failed', 'admin', null, v_payout.engagement_id,
          jsonb_build_object('amount', v_payout.amount, 'reason', p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) payment_mark_payout_paid — RECREATE with the guard widened: 0011 only
--    accepted status 'approved', which made it impossible to finalize a
--    payout that had entered 'transferring' (the webhook would always get
--    payout_not_approvable). Now both 'approved' (direct-legacy path) and
--    'transferring' (normal webhook/requery path) can be finalized.
--    Still idempotent on 'paid'.
-- ---------------------------------------------------------------------------
create or replace function public.payment_mark_payout_paid(
  p_actor_id     uuid,          -- admin profile id, or null = automatic/webhook
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
  if v_payout.status not in ('approved', 'transferring') then
    raise exception 'payout_not_approvable: status %', v_payout.status;
  end if;

  update public.payouts
    set status = 'paid', transfer_code = coalesce(p_transfer_code, v_payout.transfer_code),
        paid_at = now(), released_by = coalesce(v_payout.released_by, p_actor_id),
        updated_at = now()
    where id = p_payout_id;

  insert into public.payment_events (engagement_id, type, actor_id, actor_role, source, data)
  values (v_payout.engagement_id, 'payout.paid', p_actor_id,
          case when p_actor_id is null then 'system' else 'admin' end,
          case when p_actor_id is null then 'webhook' else 'app' end,
          jsonb_build_object('payout_id', p_payout_id, 'amount', v_payout.amount,
                             'transfer_code', coalesce(p_transfer_code, v_payout.transfer_code)));

  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  select 'payment.payout_paid', 'tutor', tp.profile_id, v_payout.engagement_id,
         jsonb_build_object('amount', v_payout.amount)
    from public.tutor_profiles tp where tp.id = v_payout.tutor_profile_id;
  insert into public.notification_outbox (type, audience, recipient_id, engagement_id, data)
  values ('payment.payout_paid', 'admin', null, v_payout.engagement_id,
          jsonb_build_object('amount', v_payout.amount));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) payment_requery_transfers — sweep helper. Returns the payouts stuck in
--    'transferring' (oldest first) with their transfer codes; the app
--    requeries Paystack for each and finalizes via mark_paid/mark_failed.
--    Stable so the caller can run it outside a locking transaction.
-- ---------------------------------------------------------------------------
create or replace function public.payment_requery_transfers(
  p_older_than_minutes int default 2
) returns table (payout_id uuid, transfer_code text)
language sql
stable
security definer
set search_path = public
as $$
  select id::uuid, transfer_code
    from public.payouts
    where status = 'transferring'
      and transfer_code is not null
      and updated_at < now() - make_interval(mins => greatest(p_older_than_minutes, 0))
    order by updated_at asc
    limit 50;
$$;

-- ---------------------------------------------------------------------------
-- 5) admin_verify_payout_account — set verified_at on a tutor's saved MoMo
--    account (the ₵1 ping-transfer check is an admin/manual step in v1).
--    Admin-only, audited, idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.admin_verify_payout_account(
  actor_id            uuid,
  p_tutor_profile_id  uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if actor_id is null or not public.is_admin(actor_id) then
    raise exception 'forbidden: admin only';
  end if;

  select * into v_row from public.tutor_payout_accounts
    where tutor_profile_id = p_tutor_profile_id
    for update;
  if v_row.id is null then
    raise exception 'payout_account_not_found';
  end if;
  if v_row.verified_at is not null then
    return;  -- already verified — idempotent
  end if;

  update public.tutor_payout_accounts
    set verified_at = now(), updated_at = now()
    where tutor_profile_id = p_tutor_profile_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, metadata)
  values (actor_id, 'verify_payout_account', 'tutor_profile', p_tutor_profile_id,
          jsonb_build_object('provider', v_row.provider, 'phone', v_row.phone));

  insert into public.notification_outbox (type, audience, recipient_id, data)
  select 'payment.payout_account_verified', 'tutor', tp.profile_id, '{}'::jsonb
    from public.tutor_profiles tp where tp.id = p_tutor_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Sweep index for the requery scan.
-- ---------------------------------------------------------------------------
create index if not exists idx_payouts_transferring
  on public.payouts (updated_at)
  where status = 'transferring';
