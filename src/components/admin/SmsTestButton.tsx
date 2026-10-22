"use client";

import { useActionState } from "react";
import { sendTestSmsAction, type SmsActionState } from "@/services/sms/mutations";
import { Button } from "@/components/ui/Button";

/** Sends a test text to the admin's own handset. */
export function SmsTestButton({ disabled }: { disabled?: boolean }) {
  const [state, formAction, pending] = useActionState<SmsActionState, FormData>(
    sendTestSmsAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending || disabled} className="h-10">
        {pending ? "Sending…" : "Send a test text to me"}
      </Button>
      {disabled && (
        <span className="text-xs text-slate-500">
          Add your phone number on your dashboard first.
        </span>
      )}
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
