"use client";

import { useActionState } from "react";
import {
  submitTutorProfile,
  type TutorFormState,
} from "@/services/tutors/mutations";
import { Field } from "@/components/ui/Field";
import { Textarea, Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";

export function TutorProfileForm({
  initial,
}: {
  initial: { bio: string; qualifications: string; ratePerHour: string };
}) {
  const [state, formAction, pending] = useActionState<TutorFormState, FormData>(
    submitTutorProfile,
    {},
  );

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

      <Field label="Bio" htmlFor="bio">
        <Textarea
          id="bio"
          name="bio"
          rows={3}
          required
          defaultValue={initial.bio}
          placeholder="A short intro students will see on your profile…"
        />
      </Field>

      <Field label="Qualifications & experience" htmlFor="qualifications">
        <Textarea
          id="qualifications"
          name="qualifications"
          rows={2}
          required
          defaultValue={initial.qualifications}
          placeholder="Degrees, certifications, years of teaching…"
        />
      </Field>

      <Field label="Hourly rate (GH₵)" htmlFor="ratePerHour">
        <Input
          id="ratePerHour"
          name="ratePerHour"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={initial.ratePerHour}
          placeholder="e.g. 100"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
