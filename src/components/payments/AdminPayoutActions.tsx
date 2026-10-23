"use client";

import { useActionState, useState } from "react";
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
 *   transferring   → no actions (in flight — the webhook or sweep finalizes)
 *   held           → Release              · Hold (update reason)
 *   paid/failed    → no actions (history)
 *
 * All three go through the 0011/0015 RPCs — the DB re-verifies admin
 * privilege and status legality, so these buttons can't do anything illegal.
 *
 * The transfer is deliberately TWO clicks: the first only arms a red confirm
 * button showing the amount. A payout is the one action in the app that moves
 * real money with nothing to reverse if the MoMo number is wrong, so a
 * single-click submit is not good enough — this is the paywall for fat fingers.
 */
export function AdminPayoutActions({
  payoutId,
  status,
  amountDisplay,
}: {
  payoutId: string;
  status:
    | "pending_review"
    | "approved"
    | "transferring"
    | "held"
    | "paid"
    | "failed";
  /** Pre-formatted amount, e.g. "GH₵1,200" — shown on the confirm button. */
  amountDisplay: string;
}) {
  const [confirming, setConfirming] = useState(false);
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

  if (status === "paid" || status === "failed" || status === "transferring") return null;

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

      {status === "approved" &&
        (confirming ? (
          <div className="space-y-2">
            <form action={execAction}>
              <input type="hidden" name="payoutId" value={payoutId} />
              <Button type="submit" variant="danger" disabled={execPending} className="w-full">
                <Send className="mr-2 h-4 w-4" />
                {execPending ? "Sending transfer…" : `Confirm — send ${amountDisplay}`}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              disabled={execPending}
              onClick={() => setConfirming(false)}
              className="w-full"
            >
              Cancel
            </Button>
            <p className="text-xs text-amber-700">
              Live transfers move real money to the tutor&apos;s MoMo number.
            </p>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirming(true)}
            className="w-full"
          >
            <Send className="mr-2 h-4 w-4" />
            Send MoMo transfer
          </Button>
        ))}

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
