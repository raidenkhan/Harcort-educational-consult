"use client";

import { useActionState, useEffect } from "react";
import {
  submitTutorProfile,
  type TutorFormState,
} from "@/services/tutors/mutations";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";

export function TutorProfileForm({
  initial,
  onSaved,
}: {
  initial: { bio: string; qualifications: string };
  /** Called once after a successful save — the profile card closes its edit
   *  modal and refreshes so the read-only view shows the new copy. */
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState<TutorFormState, FormData>(
    submitTutorProfile,
    {},
  );

  useEffect(() => {
    if (state?.message) onSaved?.();
  }, [state?.message, onSaved]);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {state?.message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.message}
        </div>
      )}
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <Field
        label="Bio"
        htmlFor="bio"
        hint="Up to 2000 characters — this is the first thing students read."
      >
        <Textarea
          id="bio"
          name="bio"
          rows={3}
          required
          maxLength={2000}
          defaultValue={initial.bio}
          placeholder="A short intro students will see on your profile…"
        />
      </Field>

      <Field
        label="Qualifications & experience"
        htmlFor="qualifications"
        hint="Up to 2000 characters — degrees, certifications, years of teaching."
      >
        <Textarea
          id="qualifications"
          name="qualifications"
          rows={3}
          required
          maxLength={2000}
          defaultValue={initial.qualifications}
          placeholder="Degrees, certifications, years of teaching…"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
