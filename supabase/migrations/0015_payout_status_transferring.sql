-- ============================================================================
-- Harcourt Educational Consult — 0015: extend payout_status
--
-- Adds the 'transferring' payout status (a transfer has been initiated but
-- not yet confirmed by Paystack). Split from 0016 because Postgres cannot
-- USE a newly added enum value until the transaction that added it commits
-- (unsafe use of new value) — and the Supabase SQL Editor wraps a paste in
-- one transaction. Run this FIRST, then 0016.
--
-- Apply: Supabase Dashboard → SQL Editor (paste & run). Safe to re-run.
-- ============================================================================

do $$ begin
  alter type public.payout_status add value if not exists 'transferring';
exception when duplicate_object then null; end $$;
