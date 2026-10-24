"use client";

import { useActionState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { payPaymentRequest } from "@/services/payments/mutations";

/**
 * Pay button for an admin-issued part-payment link.
 *
 * The client sends ONLY the token — the action resolves the link, checks it
 * belongs to this student, and re-derives the amount from the database. On
 * success the action returns a Paystack hosted-checkout URL and the browser
 * does a full-page redirect (different origin, no popup blockers).
 */
export function PayLinkButton({
  token,
  amountDisplay,
}: {
  token: string;
  amountDisplay: string;
}) {
  const [state, formAction, pending] = useActionState(payPaymentRequest, {});

  useEffect(() => {
    if (state.checkoutUrl) {
      window.location.href = state.checkoutUrl;
    }
  }, [state.checkoutUrl]);

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Opening Paystack…" : `Pay ${amountDisplay}`}
        <CreditCard className="h-4 w-4" />
      </Button>

      {state?.error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && !state.checkoutUrl && (
        <p className="mt-3 text-sm text-slate-600">{state.message}</p>
      )}
    </form>
  );
}
