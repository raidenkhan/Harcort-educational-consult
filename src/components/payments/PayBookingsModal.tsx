"use client";

import { useActionState, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { payBookings, type PaymentFormState } from "@/services/payments/mutations";
import { checkoutTotal } from "@/services/payments/fees";
import { formatGhs } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { DiscountCodeField, discountForLines, type AppliedDiscount } from "./DiscountCodeField";

export type PayableBooking = {
  id: string;
  courseLabel: string;
  tutorName: string;
  /** e.g. "1 semester · One-on-one" */
  detail: string;
  /** What is still owed on the agreement, in pesewas (as a string — bigint
   *  doesn't cross the server→client boundary). */
  owedPesewas: string;
};

/** The modal body — mounted fresh per open so a code from last time is gone. */
function PayForm({
  bookings,
  returnTo,
}: {
  bookings: PayableBooking[];
  returnTo: "cart" | "payments";
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(payBookings, {});
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);

  useEffect(() => {
    if (state.checkoutUrl) window.location.assign(state.checkoutUrl);
  }, [state.checkoutUrl]);

  const owed = bookings.map((b) => BigInt(b.owedPesewas));
  const subtotal = owed.reduce((sum, v) => sum + v, BigInt(0));
  // Per booking, like the server — the number on the button is the charge.
  const discountPesewas = discountForLines(owed, discount);
  const { feePesewas, totalPesewas } = checkoutTotal(subtotal - discountPesewas);
  const redirecting = pending || Boolean(state.checkoutUrl);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <input type="hidden" name="engagementIds" value={JSON.stringify(bookings.map((b) => b.id))} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {discount && <input type="hidden" name="discountCode" value={discount.code} />}

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {bookings.map((b) => (
          <li key={b.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block font-medium text-slate-900">{b.courseLabel}</span>
              <span className="block text-xs text-slate-500">
                with {b.tutorName} · {b.detail}
              </span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">{formatGhs(BigInt(b.owedPesewas))}</span>
          </li>
        ))}
      </ul>

      <DiscountCodeField applied={discount} onChange={setDiscount} />

      <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm" aria-live="polite">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span className="font-medium text-slate-900">{formatGhs(subtotal)}</span>
        </div>
        {discount && discountPesewas > BigInt(0) && (
          <div className="flex justify-between text-emerald-700">
            <span>Discount ({discount.percent}%)</span>
            <span className="font-medium">−{formatGhs(discountPesewas)}</span>
          </div>
        )}
        {feePesewas > BigInt(0) && (
          <div className="flex justify-between text-slate-600">
            <span>Processing fee</span>
            <span className="font-medium text-slate-900">{formatGhs(feePesewas)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="font-display text-xl font-bold text-slate-900">{formatGhs(totalPesewas)}</span>
        </div>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-6 -mb-6 border-t border-slate-100 bg-white px-6 py-4">
        <Button type="submit" disabled={redirecting} className="w-full">
          <CreditCard className="h-4 w-4" aria-hidden="true" />
          {redirecting
            ? "Opening payment…"
            : totalPesewas === BigInt(0)
              ? "Book with discount"
              : `Pay ${formatGhs(totalPesewas)}`}
        </Button>
        <p className="mt-2 text-center text-xs text-slate-500">
          You pay Harcourt, never the tutor directly.
        </p>
      </div>
    </form>
  );
}

/**
 * Every "Pay" for an existing booking opens this first: what you're paying
 * for, a discount-code box, the fee and the total — then Paystack. Used in
 * the cart (one booking or "Pay all") and on Dashboard → Payments.
 */
export function PayBookingsButton({
  bookings,
  label,
  returnTo = "cart",
  className,
  variant = "primary",
}: {
  bookings: PayableBooking[];
  label: string;
  returnTo?: "cart" | "payments";
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (bookings.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => {
          setAttempt((n) => n + 1);
          setOpen(true);
        }}
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={bookings.length === 1 ? "Pay for your booking" : `Pay for ${bookings.length} bookings`}
        description="Have a discount code? Apply it below before you pay."
        className="max-w-lg"
      >
        {open && <PayForm key={attempt} bookings={bookings} returnTo={returnTo} />}
      </Modal>
    </>
  );
}
