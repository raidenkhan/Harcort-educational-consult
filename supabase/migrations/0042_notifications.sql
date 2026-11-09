-- ============================================================================
-- Harcourt — 0042 · In-app notifications
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- The bell next to the cart. One row per thing a student or tutor should
-- know about: a chat message, a session scheduled/cancelled, a payment
-- received, a booking confirmed, a payout update, an admin payment reminder.
-- Email and SMS stay exactly as they are; this is the in-app channel.
--
--   source_key  UNIQUE dedupe claim. The payments outbox drain writes
--               `outbox:<row id>`, so a drain that runs twice (webhook +
--               return + sweep can all drain) notifies nobody twice. NULL for
--               one-off events that can't repeat (Postgres allows many NULLs
--               in a unique index).
--   created_by  the admin who sent a reminder (NULL for system events) — the
--               Unpaid page shows "last reminded" from these rows.
--   read_at     NULL = unread (drives the bell's badge).
--
-- Deny-all RLS like every private table: the service-role client is the only
-- reader/writer and scopes every query to the session profile.
-- ============================================================================

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (char_length(kind) <= 64),
  title         text not null check (char_length(title) <= 200),
  body          text check (char_length(body) <= 1000),
  link          text check (char_length(link) <= 500),
  source_key    text,
  created_by    uuid references public.profiles (id) on delete set null,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_notifications_source_key
  on public.notifications (source_key);

-- The bell's list: newest first for one recipient.
create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_id, created_at desc);

-- The bell's badge: unread count for one recipient.
create index if not exists idx_notifications_unread
  on public.notifications (recipient_id)
  where read_at is null;

-- "Last reminded" on the admin Unpaid page.
create index if not exists idx_notifications_kind_recipient
  on public.notifications (kind, recipient_id, created_at desc);

alter table public.notifications enable row level security;

notify pgrst, 'reload schema';
