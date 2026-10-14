"use client";

import { useActionState } from "react";
import { setPhoneAction, type AuthFormState } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Fields";

/**
 * The phone number we text session updates to (0022), editable from the
 * dashboard. Optional for every role — submitting an empty field clears it.
 * The parent keys this on the saved value so a successful save remounts it
 * with the stored number (same pattern as `StudyPrefsPicker`).
 */
export function PhoneForm({ current }: { current?: string | null }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    setPhoneAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <Field
        label="Phone number"
        htmlFor="phone"
        hint="Ghana mobile, e.g. 0241234567. Leave blank to remove it."
      >
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={current ?? ""}
          placeholder="0241234567"
        />
      </Field>

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
