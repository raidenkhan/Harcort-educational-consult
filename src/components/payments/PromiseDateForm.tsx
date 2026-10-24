"use client";

import { useActionState } from "react";
import { CalendarClock } from "lucide-react";
import {
  setPaymentPromise,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Fields";

/**
 * The date the admin and student agreed the balance will be settled (0032).
 *
 * This is the answer to "when does the rest come?" — without it a plan is just
 * an unpaid agreement nobody is tracking. The student sees the date on the
 * paywall and on their payment link; the console flags an overdue promise.
 * Submitting a blank date clears it.
 */
export function PromiseDateForm({
  engagementId,
  currentDate,
  overdue = false,
}: {
  engagementId: string;
  /** `YYYY-MM-DD` from the database, or null when no promise is set. */
  currentDate: string | null;
  overdue?: boolean;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    setPaymentPromise,
    {},
  );

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="engagementId" value={engagementId} />
      <label
        htmlFor={`promise-${engagementId}`}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Balance promised by
        {overdue && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
            overdue
          </span>
        )}
      </label>
      <div className="mt-1.5 flex gap-2">
        <Input
          id={`promise-${engagementId}`}
          name="date"
          type="date"
          defaultValue={currentDate?.slice(0, 10) ?? ""}
          aria-label="Date the outstanding balance will be paid"
          className="w-44 shrink-0"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          {pending ? "Saving…" : "Save date"}
        </Button>
      </div>
      {state?.error && (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="mt-1.5 text-xs font-medium text-emerald-700" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
