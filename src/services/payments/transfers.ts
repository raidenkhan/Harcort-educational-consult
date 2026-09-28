import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransfer } from "./paystack";

/**
 * Transfer reconciliation — the shared finalize step for a payout whose
 * transfer is in flight ('transferring').
 *
 * Paystack MoMo transfers are async: 'otp' / 'pending' / processing states
 * can take minutes (and rarely, hours). The webhook transfer.success /
 * transfer.failed events are the primary finalize path; this requery is the
 * self-healing fallback for missed webhooks (used by the payments sweep).
 *
 * Idempotent everywhere: mark_paid returns quietly on replay, mark_failed
 * only acts on a 'transferring' payout, and both re-check state under the
 * row lock — so a webhook and the sweep can race safely.
 */
export async function requeryAndFinalizeTransfers(
  olderThanMinutes = 2,
): Promise<{ checked: number; finalized: number }> {
  const supabase = createAdminClient();

  const { data: stuck, error } = await supabase.rpc("payment_requery_transfers", {
    p_older_than_minutes: olderThanMinutes,
  });
  if (error) {
    throw new Error(`payment_requery_transfers: ${error.message}`);
  }

  const rows = (stuck ?? []) as Array<{ payout_id: string; transfer_code: string }>;
  let finalized = 0;

  for (const row of rows) {
    try {
      const transfer = await verifyTransfer(row.transfer_code);

      if (transfer.status === "success") {
        const { error: paidError } = await supabase.rpc("payment_mark_payout_paid", {
          p_actor_id: null,
          p_payout_id: row.payout_id,
          p_transfer_code: row.transfer_code,
        });
        if (paidError) throw new Error(paidError.message);
      } else if (transfer.status === "failed" || transfer.status === "reversed") {
        const { error: failError } = await supabase.rpc("payment_mark_payout_failed", {
          p_actor_id: null,
          p_payout_id: row.payout_id,
          p_reason: `Paystack transfer ${row.transfer_code} is ${transfer.status}`,
        });
        if (failError) throw new Error(failError.message);
      } else {
        // otp / pending / still processing — leave for the next sweep.
        continue;
      }
      finalized += 1;
    } catch (err) {
      // Log and continue with the rest; the next sweep retries.
      console.error(
        `[payments] requery failed for payout ${row.payout_id} (transfer ${row.transfer_code}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { checked: rows.length, finalized };
}
