"use client";

import { useActionState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { commitAndStartCheckout } from "@/services/payments/mutations";
import type { PaymentFormState } from "@/services/payments/mutations";

/**
 * "Pay & book" CTA on a directory card: one click creates (or re-enters)
 * the 50/50 payment agreement for this tutor's quoted course and redirects
 * straight into Paystack's hosted checkout for the first 50%.
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
      <AuthTrigger tab="sign-up" className={className}>
        <CreditCard className="mr-1.5 inline h-3.5 w-3.5" />
        {label}
      </AuthTrigger>
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
