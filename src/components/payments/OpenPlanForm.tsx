"use client";

import { useActionState } from "react";
import { FolderPlus } from "lucide-react";
import {
  openPaymentPlan,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";

/**
 * Opens a payment plan for a request that has no agreement yet (0032).
 *
 * The student hit the paywall and asked for help; the admin opens the plan,
 * which creates the agreement (full semester fee as one installment) on the
 * student's behalf. Until that exists there is nothing to record a part
 * payment against. Idempotent — opening twice just re-enters the plan.
 */
export function OpenPlanForm({
  requestId,
  label = "Open plan",
}: {
  requestId: string;
  label?: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    openPaymentPlan,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="requestId" value={requestId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <FolderPlus className="h-4 w-4" />
        {pending ? "Opening…" : label}
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
