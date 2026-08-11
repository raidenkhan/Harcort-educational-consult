"use client";

import { useActionState } from "react";
import {
  addTutorService,
  type TutorFormState,
} from "@/services/tutors/mutations";
import { Field } from "@/components/ui/Field";
import { Select, Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import type { Course } from "@/types";

export function TutorServiceForm({ courses }: { courses: Course[] }) {
  const [state, formAction, pending] = useActionState<TutorFormState, FormData>(
    addTutorService,
    {},
  );

  const subjects = Array.from(new Set(courses.map((c) => c.subject)));

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

      <Field label="Course" htmlFor="courseId">
        <Select id="courseId" name="courseId" required defaultValue="">
          <option value="" disabled>
            Select a course…
          </option>
          {subjects.map((subject) => (
            <optgroup key={subject} label={subject}>
              {courses
                .filter((c) => c.subject === subject)
                .map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      <Field label="Price per hour (GH₵)" htmlFor="price">
        <Input
          id="price"
          name="price"
          type="number"
          min={0}
          step="0.01"
          required
          placeholder="e.g. 100"
        />
      </Field>

      <Button variant="dark" type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add course"}
      </Button>
    </form>
  );
}
