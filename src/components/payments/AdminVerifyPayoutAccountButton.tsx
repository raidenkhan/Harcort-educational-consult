"use client";

import { useActionState } from "react";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import {
  adminSetPayoutAccountVerified,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";

/**
 * Verify action for one tutor payout account (0015). The ₵1 ping-transfer
 * check is a manual/admin step in v1: the admin confirms the MoMo details
 * (ideally after a test ping transfer) and clicks verify — which sets
 * verified_at via the audited admin_verify_payout_account RPC and unlocks
 * the tutor's payout requests.
 */
export function AdminVerifyPayoutAccountButton({
  tutorProfileId,
  verified,
}: {
  tutorProfileId: string;
  verified: boolean;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    adminSetPayoutAccountVerified,
    {},
  );

  if (verified) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <BadgeCheck className="h-4 w-4" />
        Verified
      </span>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        <ShieldCheck className="mr-1.5 h-4 w-4" />
        {pending ? "Verifying…" : state.message ? "Verified" : "Verify account"}
      </Button>
      {state.error && (
        <p className="text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
