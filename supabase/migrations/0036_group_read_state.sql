-- ============================================================================
-- Harcourt — 0036 · Study-group read state
-- Run in: Supabase Dashboard → SQL Editor (paste & run) — safe to re-run.
--
-- The groups workspace had no idea what a member had already seen: every
-- group looked the same, so a student could not tell that a tutor had added
-- them or that the group had new messages. This adds the per-membership
-- watermark the unread badge is computed from.
--
--   unread = messages in the group with created_at > last_read_at
--            and sender_id <> the member
--
-- The default is now(), so deploying this does NOT turn every historical
-- message into an unread badge: existing members start caught up. A member
-- added by a tutor is inserted before the "added you" system message, so
-- that message — and everything after it — is unread for them.
--
-- Deny-all RLS is unchanged: the service-role client is the only reader, and
-- the service layer still enforces membership on every call.
-- ============================================================================

alter table public.study_group_members
  add column if not exists last_read_at timestamptz not null default now();

-- The unread sweep reads every membership for one profile, then messages
-- newer than the oldest watermark.
create index if not exists study_group_members_profile_read_idx
  on public.study_group_members (profile_id, group_id, last_read_at);
