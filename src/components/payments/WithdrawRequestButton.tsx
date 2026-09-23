"use client";

import { useActionState } from "react";
import { X } from "lucide-react";
import { withdrawTutorRequest } from "@/services/requests/mutations";
import type { RequestFormState } from "@/services/requests/mutations";
import { Button } from "@/components/ui/Button";

/** Withdraw button for one pending request (client — useActionState). */
export function WithdrawRequestButton({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    withdrawTutorRequest,
    {},
  );

  if (state.message) {
    return (
      <span className="text-xs text-slate-500" role="status">
        Withdrawn
      </span>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={requestId} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pending}
        title="Withdraw this request"
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">Withdraw</span>
      </Button>
    </form>
  );
}
