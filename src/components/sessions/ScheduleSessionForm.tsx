"use client";

import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import { createSession, type SessionFormState } from "@/services/sessions/mutations";
import { Field } from "@/components/ui/Field";
import { Input, Select } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";

export function ScheduleSessionForm({
  students,
}: {
  students: { id: string; full_name: string }[];
}) {
  const [state, formAction, pending] = useActionState<SessionFormState, FormData>(
    createSession,
    {},
  );

  if (students.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
        Students who contact you through Harcot will appear here, ready to be
        scheduled.
      </p>
    );
  }

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

      <Field label="Student" htmlFor="studentId">
        <Select id="studentId" name="studentId" required defaultValue="">
          <option value="" disabled>
            Select a student…
          </option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.full_name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="When" htmlFor="scheduledAt">
        <Input
          id="scheduledAt"
          name="scheduledAt"
          type="datetime-local"
          required
        />
      </Field>

      <Field label="Duration" htmlFor="durationMinutes">
        <Select id="durationMinutes" name="durationMinutes" defaultValue="60">
          <option value="30">30 minutes</option>
          <option value="45">45 minutes</option>
          <option value="60">1 hour</option>
          <option value="90">1.5 hours</option>
          <option value="120">2 hours</option>
        </Select>
      </Field>

      <Field label="Topic" htmlFor="topic">
        <Input
          id="topic"
          name="topic"
          placeholder="e.g. Laplace transforms"
        />
      </Field>

      <Field label="Location" htmlFor="location">
        <Input
          id="location"
          name="location"
          placeholder="e.g. Library, KNUST · Online"
        />
      </Field>

      <Button type="submit" disabled={pending} className="w-full">
        <CalendarPlus className="h-4 w-4" />
        {pending ? "Scheduling…" : "Schedule session"}
      </Button>
    </form>
  );
}
