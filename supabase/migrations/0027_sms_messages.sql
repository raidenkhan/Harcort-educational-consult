-- ============================================================================
-- Harcourt Educational Consult — 0027: SMS log + per-user SMS preferences
--
-- The Arkesel SMS integration (src/lib/sms.ts) sends real, billable messages
-- to real handsets. Two things that follow from that need to be persisted:
--
--   1. A LOG. Every attempt (sent, failed, skipped) is recorded with the
--      provider's message id, so a delivery report from Arkesel can be matched
--      back to the message we sent, and an admin can see what went out, to
--      whom and at what cost.
--   2. A DEDUPE KEY. Scheduled work (session reminders) can run more than
--      once for the same logical event — a retry, a re-run of the cron, two
--      overlapping runs. The unique index on `dedupe_key` turns "text the
--      student about session X" into an atomic claim: the first caller wins,
--      everyone else is a no-op. Without it a reminder is a money leak.
--
-- `profiles.sms_opt_out` is the user's kill switch. `sms_verified_at` records
-- that the number was proven to belong to the user (Arkesel OTP) — until then
-- the number is unproven, and the app may text it but never asks it to carry
-- an account-recovery code on its own.
--
-- RLS: deny-all (no policies) — the service-role client is the only reader,
-- and the admin page gates on requireRole("admin").
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

create table if not exists public.sms_messages (
  id           bigint generated always as identity primary key,
  -- Who the message was for. Null for system messages with no owner.
  profile_id   uuid references public.profiles (id) on delete set null,
  -- E.164 digits-only, as Arkesel wants it ("233241234567").
  to_number    text not null check (char_length(to_number) between 10 and 20),
  -- The text we sent (kept for the admin log; no secrets go in here).
  body         text not null check (char_length(body) between 1 and 2000),
  -- What the message was about: session_reminder | session_cancelled |
  -- request | request_response | payment | payment_reminder | reset | test.
  kind         text not null check (char_length(kind) between 1 and 40),
  -- Arkesel's message id — the key a delivery report comes back with.
  sms_id       text,
  -- sent | failed | skipped | unknown (delivery report not in yet).
  status       text not null default 'pending'
                 check (status in ('pending', 'sent', 'failed', 'skipped', 'unknown')),
  -- Arkesel's own delivery verdict, verbatim: DELIVERED | SUBMITTED |
  -- QUEUED | NOT_DELIVERED | PROHIBITED | EXPIRED. Null until the report
  -- arrives (batched, ~10 minutes after the send).
  delivery_status text check (delivery_status is null or char_length(delivery_status) <= 40),
  -- Why it failed, when it failed, or why it was skipped.
  error        text check (error is null or char_length(error) <= 500),
  -- The atomic claim for scheduled work ("session:<id>:reminder:<profile>").
  -- Null for one-off messages, which have no dedupe semantics.
  dedupe_key   text check (dedupe_key is null or char_length(dedupe_key) <= 160),
  created_at   timestamptz not null default now()
);

-- The claim. A unique index (not a constraint) so re-running the migration
-- over an existing table with duplicate rows can't fail.
create unique index if not exists idx_sms_messages_dedupe
  on public.sms_messages (dedupe_key)
  where dedupe_key is not null;

-- The admin log reads newest-first and filters by status.
create index if not exists idx_sms_messages_created
  on public.sms_messages (created_at desc);
create index if not exists idx_sms_messages_status
  on public.sms_messages (status, created_at desc);
-- Delivery reports look a message up by the provider's id.
create index if not exists idx_sms_messages_sms_id
  on public.sms_messages (sms_id)
  where sms_id is not null;
-- Per-recipient volume checks (daily cap).
create index if not exists idx_sms_messages_to_number
  on public.sms_messages (to_number, created_at desc);

alter table public.sms_messages enable row level security;
-- (No policies on purpose.)

comment on table public.sms_messages is
  'Log of every SMS attempt (0027). Dedupe key makes scheduled sends atomic; provider ids match delivery reports.';

-- ---------------------------------------------------------------------------
-- Per-user SMS preferences
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'sms_opt_out'
  ) then
    alter table public.profiles
      add column sms_opt_out boolean not null default false;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'sms_verified_at'
  ) then
    -- NULL = never proven. A number is only "verified" once the owner proved
    -- it (Arkesel OTP) — until then it can be texted, but it is not trusted
    -- to carry a password-reset code on its own.
    alter table public.profiles
      add column sms_verified_at timestamptz;
  end if;
end $$;
