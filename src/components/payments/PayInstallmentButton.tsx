"use client";

import { useActionState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initializeInstallmentPayment } from "@/services/payments/mutations";

/**
 * Pay-now button for one installment. On success the action returns a
 * Paystack hosted-checkout URL; the client redirects. Full page load on
 * purpose — the hosted page is a different origin, no popup blockers.
 */
export function PayInstallmentButton({
  engagementId,
  installmentId,
  amountDisplay,
  disabled = false,
  disabledReason,
}: {
  engagementId: string;
  installmentId: string;
  amountDisplay: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, formAction, pending] = useActionState(
    initializeInstallmentPayment,
    {},
  );

  useEffect(() => {
    if (state.checkoutUrl) {
      window.location.href = state.checkoutUrl;
    }
    // Re-running on the same state object is harmless: the redirect has
    // already navigated away, and state resets on the next submit.
  }, [state.checkoutUrl]);

  if (disabled) {
    return (
      <Button variant="secondary" disabled title={disabledReason}>
        {amountDisplay}
      </Button>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="engagementId" value={engagementId} />
      <input type="hidden" name="installmentId" value={installmentId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Opening Paystack…" : `Pay ${amountDisplay}`}
        <CreditCard className="ml-2 h-4 w-4" />
      </Button>
    </form>
  );
}
