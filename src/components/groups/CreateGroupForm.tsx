"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createGroup, type GroupFormState } from "@/services/groups/mutations";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input, Select, Textarea } from "@/components/ui/Fields";

/**
 * Tutor/admin "New group" panel for /groups. Creates a course-scoped room and
 * lands the owner in it (the group id comes back in the action state).
 */
export function CreateGroupForm({
  courses,
}: {
  courses: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<GroupFormState, FormData>(
    createGroup,
    {},
  );

  useEffect(() => {
    if (state?.ok && state.groupId) {
      router.push(`/groups?g=${state.groupId}`);
    }
  }, [state, router]);

  return (
    <Card className="mt-8">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50">
          <Plus className="h-4 w-4 text-brand-700" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">New study group</h2>
          <p className="text-xs text-slate-500">
            Create a room for one of your courses. Students join with the code
            you share.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Group name" htmlFor="name">
          <Input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="e.g. Thermodynamics study circle"
          />
        </Field>

        <Field label="Course" htmlFor="courseId">
          <Select id="courseId" name="courseId" defaultValue="">
            <option value="">No specific course</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Description" htmlFor="description" hint="Optional.">
            <Textarea
              id="description"
              name="description"
              maxLength={500}
              rows={2}
              placeholder="What you'll cover, when you meet…"
            />
          </Field>
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending} className="h-10">
            {pending ? "Creating…" : "Create group"}
          </Button>
          {state?.error && (
            <p className="text-xs font-medium text-red-600" role="alert">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}
