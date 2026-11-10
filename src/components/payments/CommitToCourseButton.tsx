"use client";

import { useActionState, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { AccountChoiceModal } from "@/components/auth/AccountChoiceModal";
import { commitAndStartCheckout } from "@/services/payments/mutations";
import type { PaymentFormState } from "@/services/payments/mutations";

/**
 * "Pay & book" CTA on a directory card: one click creates (or re-enters)
 * the payment agreement for this tutor's quoted course and redirects
 * straight into Paystack's hosted checkout for the full semester fee
 * (0029 — 100% upfront).
 *
 * Signed-out visitors get the auth modal instead — same session-aware
 * pattern as ContactTutorButton. After payment the student lands back on
 * /dashboard, where the payments card shows the plan.
 */
export function CommitToCourseButton({
  tutorServiceId,
  label,
  signedIn,
  className,
}: {
  tutorServiceId: string;
  label: string;
  signedIn: boolean;
  className?: string;
}) {
  // Signed out: the page to come back to after "have an account?" → sign in
  // or sign up. Captured on click (never read from window during render).
  const [authNext, setAuthNext] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    commitAndStartCheckout,
    {},
  );

  useEffect(() => {
    if (state.checkoutUrl) {
      window.location.href = state.checkoutUrl;
    }
  }, [state.checkoutUrl]);

  if (!signedIn) {
    return (
      <>
        <button
          type="button"
          className={className}
          onClick={() => setAuthNext(window.location.pathname + window.location.search)}
        >
          <CreditCard className="mr-1.5 inline h-3.5 w-3.5" />
          {label}
        </button>
        <AccountChoiceModal
          open={authNext !== null}
          onClose={() => setAuthNext(null)}
          next={authNext ?? undefined}
        />
      </>
    );
  }

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="tutorServiceId" value={tutorServiceId} />
      <button
        type="submit"
        disabled={pending}
        className={className}
      >
        <CreditCard className="mr-1.5 inline h-3.5 w-3.5" />
        {pending ? "Opening Paystack…" : label}
      </button>
      {state?.error && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && !state.checkoutUrl && (
        <p className="mt-2 text-xs font-medium text-slate-600" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
