"use client";

import { useActionState } from "react";
import { X } from "lucide-react";
import {
  cancelPaymentRequest,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";

/**
 * Cancel an open part-payment link (0032). Used when the student never paid it
 * or the admin is issuing a replacement. A paid link is immutable — the money
 * row is the record — so the RPC refuses.
 */
export function CancelPaymentLinkButton({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    cancelPaymentRequest,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        <X className="h-3.5 w-3.5" />
        {pending ? "Cancelling…" : "Cancel link"}
      </Button>
      {state?.error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="text-xs font-medium text-emerald-700" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
