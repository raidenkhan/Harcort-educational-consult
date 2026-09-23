"use client";

import { useActionState } from "react";
import { CheckCircle2, Pause, Send } from "lucide-react";
import {
  adminExecutePayout,
  adminHoldPayout,
  adminReleasePayout,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Fields";

/**
 * Admin action set for one payout row, keyed by status:
 *   pending_review → Release (to approved) · Hold (reason required)
 *   approved       → Execute transfer     · Hold
 *   held           → Release              · Hold (update reason)
 *   paid/failed    → no actions (history)
 *
 * All three go through the 0011 RPCs — the DB re-verifies admin privilege
 * and status legality, so these buttons can't do anything illegal.
 */
export function AdminPayoutActions({
  payoutId,
  status,
}: {
  payoutId: string;
  status: "pending_review" | "approved" | "held" | "paid" | "failed";
}) {
  const [releaseState, releaseAction, releasePending] = useActionState<PaymentFormState, FormData>(
    adminReleasePayout,
    {},
  );
  const [holdState, holdAction, holdPending] = useActionState<PaymentFormState, FormData>(
    adminHoldPayout,
    {},
  );
  const [execState, execAction, execPending] = useActionState<PaymentFormState, FormData>(
    adminExecutePayout,
    {},
  );

  if (status === "paid" || status === "failed") return null;

  const error = releaseState.error ?? holdState.error ?? execState.error;
  const message = releaseState.message ?? holdState.message ?? execState.message;

  return (
    <div className="w-full max-w-xs space-y-2">
      {(status === "pending_review" || status === "held") && (
        <form action={releaseAction}>
          <input type="hidden" name="payoutId" value={payoutId} />
          <Button type="submit" variant="secondary" disabled={releasePending} className="w-full">
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {releasePending ? "Approving…" : "Approve payout"}
          </Button>
        </form>
      )}

      {status === "approved" && (
        <form action={execAction}>
          <input type="hidden" name="payoutId" value={payoutId} />
          <Button type="submit" disabled={execPending} className="w-full">
            <Send className="mr-2 h-4 w-4" />
            {execPending ? "Sending transfer…" : "Send MoMo transfer"}
          </Button>
        </form>
      )}

      <form action={holdAction} className="flex gap-2">
        <input type="hidden" name="payoutId" value={payoutId} />
        <Input name="reason" required placeholder="Hold reason (required)" />
        <Button type="submit" variant="ghost" disabled={holdPending} title="Put this payout on hold">
          <Pause className="h-4 w-4" />
          <span className="sr-only">Hold payout</span>
        </Button>
      </form>

      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
      {message && !error && (
        <p className="text-xs text-emerald-700" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
