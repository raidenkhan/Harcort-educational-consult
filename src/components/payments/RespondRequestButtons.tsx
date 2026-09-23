"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";
import { respondTutorRequest } from "@/services/requests/mutations";
import type { RequestFormState } from "@/services/requests/mutations";
import { Button } from "@/components/ui/Button";

/** Accept/decline pair for one pending request. DB RPC is the authority. */
export function RespondRequestButtons({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    respondTutorRequest,
    {},
  );

  if (state.message) {
    return (
      <p className="max-w-xs text-xs text-emerald-700" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <form action={formAction} className="w-full max-w-xs space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex gap-2">
        <Button type="submit" name="accept" value="accept" disabled={pending} className="flex-1">
          <Check className="mr-1.5 h-4 w-4" />
          {pending ? "…" : "Accept"}
        </Button>
        <Button
          type="submit"
          name="accept"
          value="decline"
          variant="secondary"
          disabled={pending}
          className="flex-1"
        >
          <X className="mr-1.5 h-4 w-4" />
          Decline
        </Button>
      </div>
      {state.error && (
        <p className="text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
