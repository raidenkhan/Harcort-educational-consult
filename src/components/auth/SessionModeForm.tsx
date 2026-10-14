"use client";

import { useActionState } from "react";
import { setSessionModeAction, type AuthFormState } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { normalizeSessionMode } from "@/services/auth/sessionFormat";
import { SessionModePicker } from "./SessionModePicker";

/**
 * The student's session format, editable from the dashboard (0021) — the
 * change-my-mind path for the answer they gave at sign-up. The parent keys
 * this on the saved value so a successful save remounts it with the stored
 * value (same pattern as `StudyPrefsPicker`).
 */
export function SessionModeForm({ current }: { current?: unknown }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    setSessionModeAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <SessionModePicker
        defaultMode={normalizeSessionMode(current)}
        legend="How you want your sessions"
      />

      <div className="flex flex-wrap items-center gap-3 pt-1">
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
