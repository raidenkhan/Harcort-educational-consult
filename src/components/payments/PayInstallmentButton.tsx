"use client";

import { useActionState, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { initializeInstallmentPayment } from "@/services/payments/mutations";

/**
 * Pay-now button for one installment — or for the whole agreement when no
 * installment is named (0039 one-off: the charge settles the agreement).
 * On success the action returns a Paystack hosted-checkout URL; the client
 * redirects. Full page load on purpose — the hosted page is a different
 * origin, no popup blockers.
 */
export function PayInstallmentButton({
  engagementId,
  installmentId,
  amountDisplay,
  disabled = false,
  disabledReason,
  summary,
}: {
  engagementId: string;
  /** Null = a one-off payment with no admin-created schedule (0039). */
  installmentId?: string | null;
  amountDisplay: string;
  disabled?: boolean;
  disabledReason?: string;
  /** What the confirm modal lists before Paystack. */
  summary?: { title: string; amount: string; fee: string | null };
}) {
  const [open, setOpen] = useState(false);
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

  // Every Pay opens a confirm modal first (the same habit as the booking
  // modal); this one has no discount box — codes apply to whole bookings,
  // not to one installment of an admin-made plan.
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {`Pay ${amountDisplay}`}
        <CreditCard className="ml-2 h-4 w-4" />
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Pay this installment"
        description="Discount codes apply to whole bookings — use them from your cart or when you book."
        className="max-w-md"
      >
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="engagementId" value={engagementId} />
          {/* Omitted when null — an empty string would fail the uuid schema and
              the action would report "Missing installment" for a valid one-off. */}
          {installmentId ? (
            <input type="hidden" name="installmentId" value={installmentId} />
          ) : null}
          {summary && (
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <p className="font-medium text-slate-900">{summary.title}</p>
              <div className="flex justify-between text-slate-600">
                <span>Amount</span>
                <span className="font-medium text-slate-900">{summary.amount}</span>
              </div>
              {summary.fee && (
                <div className="flex justify-between text-slate-600">
                  <span>Processing fee</span>
                  <span className="font-medium text-slate-900">{summary.fee}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                <span>Total</span>
                <span>{amountDisplay}</span>
              </div>
            </div>
          )}
          {state.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending || Boolean(state.checkoutUrl)} className="w-full">
            {pending || state.checkoutUrl ? "Opening Paystack…" : `Pay ${amountDisplay}`}
            <CreditCard className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </Modal>
    </>
  );
}
