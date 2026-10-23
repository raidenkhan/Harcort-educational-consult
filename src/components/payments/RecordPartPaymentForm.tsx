"use client";

import { useActionState } from "react";
import { NotebookPen } from "lucide-react";
import {
  recordPartPayment,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Fields";

/**
 * Admin records a payment collected OUT OF BAND (0029) — cash, a personal
 * MoMo transfer, a bank deposit — against one student's agreement. The
 * student pays the ADMIN (never the tutor); this row makes the money visible
 * to the agreement, the tutor's earnings and the analytics exactly like a
 * Paystack payment, with a synthetic ADMIN- reference in the ledger.
 *
 * The amount is typed in cedis; the action converts to pesewas server-side
 * and the DB RPC re-checks it against the outstanding balance.
 */
export function RecordPartPaymentForm({
  engagementId,
  remainingDisplay,
}: {
  engagementId: string;
  /** Formatted outstanding balance, e.g. "GH₵800 of GH₵1,200". */
  remainingDisplay: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    recordPartPayment,
    {},
  );

  return (
    <form action={formAction} className="w-full max-w-md">
      <input type="hidden" name="engagementId" value={engagementId} />
      <p className="text-xs font-semibold text-slate-700">
        Record a part payment{" "}
        <span className="font-normal text-slate-400">
          (outstanding {remainingDisplay})
        </span>
      </p>
      <div className="mt-1.5 flex gap-2">
        <Input
          name="amountCedis"
          type="number"
          min="0.01"
          step="0.01"
          required
          placeholder="Amount received (GH₵)"
          aria-label="Amount received in cedis"
          className="w-44 shrink-0"
        />
        <Input
          name="note"
          type="text"
          maxLength={280}
          placeholder="Note — e.g. MoMo to admin, part 1 of 2"
          aria-label="Payment note"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          <NotebookPen className="h-4 w-4" />
          {pending ? "Recording…" : "Record"}
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
