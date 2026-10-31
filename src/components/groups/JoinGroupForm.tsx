"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { joinGroup, type GroupFormState } from "@/services/groups/mutations";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Fields";

/**
 * Join a study group with the code a tutor shared.
 *
 * `initialCode` comes from a shared link (`/groups?code=K7M2QX`): the tutor's
 * "Copy link" button puts the code in the URL, so a student who opens it on a
 * new device finds the form already filled in — one tap to join.
 */
export function JoinGroupForm({ initialCode }: { initialCode?: string }) {
  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(
    joinGroup,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <Field
        label="Join a group"
        htmlFor="joinCode"
        hint="Enter the code your tutor shared — e.g. K7M2QX."
      >
        <Input
          id="joinCode"
          name="joinCode"
          placeholder="K7M2QX"
          defaultValue={initialCode}
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
          className="uppercase"
        />
      </Field>
      <Button type="submit" disabled={pending} className="h-10">
        <KeyRound className="h-4 w-4" />
        {pending ? "Joining…" : "Join group"}
      </Button>

      {state?.error && (
        <p className="text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
