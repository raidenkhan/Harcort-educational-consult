"use client";

import { useActionState } from "react";
import { BanknoteArrowDown } from "lucide-react";
import { requestPayout } from "@/services/payments/mutations";
import type { PaymentFormState } from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";

/**
 * Payout request button for one engagement. The DB RPC is the authority —
 * it refuses unless every installment is paid and every session dual-ticked
 * — and its guard messages surface here as friendly copy.
 */
export function RequestPayoutButton({ engagementId }: { engagementId: string }) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    requestPayout,
    {},
  );

  if (state.message) {
    return (
      <p className="max-w-xs text-xs text-emerald-700" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="engagementId" value={engagementId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        <BanknoteArrowDown className="mr-2 h-4 w-4" />
        {pending ? "Requesting…" : "Request payout"}
      </Button>
      {state.error && (
        <p className="max-w-xs text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
