"use client";

import { useActionState } from "react";
import { setSmsOptOutAction, type AuthFormState } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";

/**
 * The SMS kill switch (0027).
 *
 * While it is off the app never texts this number: no session reminders, no
 * request updates, no payment notices, no reset codes. It is a real setting,
 * not a preference we might honour "later" — the send path checks it before
 * every message.
 *
 * The checkbox posts "on" when ticked; unticked it posts nothing and the
 * schema reads that as false.
 */
export function SmsPreferenceForm({
  optedOut,
}: {
  /** True when the user has turned texts OFF. */
  optedOut: boolean;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    setSmsOptOutAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          name="optedOut"
          defaultChecked={optedOut}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        <span>
          <span className="font-medium text-slate-900">
            Turn off text messages
          </span>
          <span className="mt-0.5 block text-slate-600">
            We text you about your sessions, your tutor requests and your
            payments. Tick this to stop all of it — your number stays on file
            for nothing else.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? "Saving…" : "Save"}
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
      </div>
    </form>
  );
}
