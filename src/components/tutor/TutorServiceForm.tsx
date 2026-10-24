"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  addTutorService,
  type TutorFormState,
} from "@/services/tutors/mutations";
import { Field } from "@/components/ui/Field";
import { Select, Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  groupCoursesForPicker,
  levelLabel,
  sortFields,
  YEARS,
} from "@/components/home/courseTaxonomy";
import type { Course } from "@/types";

/**
 * Add or EDIT a course offering (0031).
 *
 * The tutor picks how the course is offered — one-on-one, group, or both —
 * and only the matching price field(s) render. An unoffered format is stored
 * as NULL, so the request dialog disables it and the paywall refuses it,
 * instead of quietly charging the other price. The server still enforces at
 * least one price as a backstop (the form's `required` can only mark one
 * input, and the format choice is the source of truth).
 *
 * In EDIT mode (`initial` is set) the course is fixed (shown as a locked
 * label) and the tutor only changes how it's offered and its price — leaving
 * a format out removes it from the offer. `addTutorService` already re-prices
 * an existing (tutor, course) pair, so "edit" is the same action.
 *
 * The catalog picker is programme → course (grouped Level 100 · Semester 1 …),
 * because "ME 255" is how a tutor knows their own course. A course the
 * catalog doesn't have yet can be added by code; it is unpublished until an
 * admin approves it, but the tutor can price and teach it immediately.
 */

/** The three ways a course can be offered. "both" is the default — most
 *  tutors take a cohort and also do solo sessions. */
type FormatChoice = "one_on_one" | "group" | "both";

const FORMAT_CHOICES: ReadonlyArray<{
  value: FormatChoice;
  label: string;
  description: string;
}> = [
  {
    value: "one_on_one",
    label: "One-on-one",
    description: "Just you and the student, alone.",
  },
  {
    value: "group",
    label: "Group / cohort",
    description: "A group of students learning together.",
  },
  {
    value: "both",
    label: "Both",
    description: "Offer it both ways, at two prices.",
  },
];

/** What the edit form is pre-filled from. */
export type ServiceToEdit = {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  priceOneOnOne: number | null;
  priceGroup: number | null;
};

/** The format choice implied by which prices the course already has. */
function formatFrom(service: ServiceToEdit): FormatChoice {
  const one = service.priceOneOnOne != null;
  const group = service.priceGroup != null;
  if (one && group) return "both";
  if (one) return "one_on_one";
  if (group) return "group";
  return "both"; // broken row — DB check makes this impossible in practice
}

export function TutorServiceForm({
  courses,
  initial,
  onCancel,
  onSaved,
}: {
  courses: Course[];
  /** Set to edit an existing service; omit to add a new one. */
  initial?: ServiceToEdit;
  /** "Cancel" for edit mode — returns the parent to the add/list view. */
  onCancel?: () => void;
  /** Called once after a successful save (parent refreshes + exits edit). */
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState<TutorFormState, FormData>(
    addTutorService,
    {},
  );

  useEffect(() => {
    if (state?.message) onSaved?.();
  }, [state?.message, onSaved]);

  const subjects = sortFields(Array.from(new Set(courses.map((c) => c.subject))));
  const [subject, setSubject] = useState(subjects[0] ?? "");
  const [addingCourse, setAddingCourse] = useState(false);
  const [formats, setFormats] = useState<FormatChoice>(
    initial ? formatFrom(initial) : "both",
  );

  const subjectCourses = courses.filter((c) => c.subject === subject);
  const groups = groupCoursesForPicker(subjectCourses);

  const editing = Boolean(initial);

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

      {editing ? (
        <>
          <input type="hidden" name="courseId" value={initial!.courseId} />
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Course
            </p>
            <p className="mt-0.5 font-medium text-slate-900">
              {initial!.courseCode ? `${initial!.courseCode} · ` : ""}
              {initial!.courseName}
            </p>
          </div>
        </>
      ) : addingCourse ? (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Add a course that isn&apos;t listed
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                An admin reviews it before it appears in the public course
                directory. You can teach it straight away.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAddingCourse(false)}
            >
              Back to the list
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Course code" htmlFor="newCourseCode" hint="e.g. ME 158">
              <Input
                id="newCourseCode"
                name="newCourseCode"
                type="text"
                required
                maxLength={40}
                autoComplete="off"
                placeholder="ME 158"
              />
            </Field>
            <Field label="Course name" htmlFor="newCourseName">
              <Input
                id="newCourseName"
                name="newCourseName"
                type="text"
                required
                maxLength={160}
                placeholder="Computer Programming for Engineers"
              />
            </Field>
            <Field
              label="Programme"
              htmlFor="newCourseSubject"
              hint="Pick an existing programme or type a new one."
            >
              <Input
                id="newCourseSubject"
                name="newCourseSubject"
                type="text"
                required
                maxLength={120}
                list="tutor-service-subjects"
                defaultValue={subject}
                placeholder="Mechanical Engineering"
              />
              <datalist id="tutor-service-subjects">
                {subjects.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Level" htmlFor="newCourseYear">
                <Select id="newCourseYear" name="newCourseYear" required defaultValue="">
                  <option value="" disabled>
                    Level…
                  </option>
                  {YEARS.map((year) => (
                    <option key={year} value={year}>
                      {levelLabel(year)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Semester" htmlFor="newCourseSemester">
                <Select
                  id="newCourseSemester"
                  name="newCourseSemester"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Semester…
                  </option>
                  <option value={1}>Semester 1</option>
                  <option value={2}>Semester 2</option>
                </Select>
              </Field>
            </div>
          </div>
        </div>
      ) : (
        <>
          <Field label="Programme" htmlFor="serviceSubject">
            <Select
              id="serviceSubject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              {subjects.length === 0 && <option value="">No programmes yet</option>}
              {subjects.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Course" htmlFor="courseId">
            <Select id="courseId" name="courseId" required defaultValue="">
              <option value="" disabled>
                Select a course…
              </option>
              {groups.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.items.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code ? `${course.code} · ${course.name}` : course.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>

          <button
            type="button"
            onClick={() => setAddingCourse(true)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800"
          >
            <Plus className="h-3.5 w-3.5" />
            My course isn&apos;t listed — add it by code
          </button>
        </>
      )}

      {/* How the course is offered. Picking a format here IS the choice of
          what a student can request; the unoffered format is stored NULL and
          the request dialog greys it out with "Not offered for this course." */}
      <fieldset>
        <legend className="block text-sm font-medium text-slate-700">
          How do you offer this course?
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FORMAT_CHOICES.map((choice) => {
            const active = formats === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFormats(choice.value)}
                className={cn(
                  "rounded-md border px-3 py-2.5 text-left transition",
                  active
                    ? "border-brand-600 bg-brand-50/60 ring-2 ring-brand-600/15"
                    : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {choice.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                  {choice.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className={cn("grid gap-3", formats === "both" && "sm:grid-cols-2")}>
        {(formats === "one_on_one" || formats === "both") && (
          <Field
            label="One-on-one price (GH₵ / semester)"
            htmlFor="priceOneOnOne"
            hint="Per student."
          >
            <Input
              id="priceOneOnOne"
              name="priceOneOnOne"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={initial?.priceOneOnOne ?? ""}
              placeholder="e.g. 400"
            />
          </Field>
        )}
        {(formats === "group" || formats === "both") && (
          <Field
            label="Group price (GH₵ / semester)"
            htmlFor="priceGroup"
            hint="Per student in the group."
          >
            <Input
              id="priceGroup"
              name="priceGroup"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue={initial?.priceGroup ?? ""}
              placeholder="e.g. 250"
            />
          </Field>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {editing
          ? "A format you leave out is removed from your offer."
          : "Re-adding a course you already teach updates its prices — a format you leave out is removed, so pick “Both” if you still take it both ways."}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="dark" type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : editing
              ? "Save changes"
              : addingCourse
                ? "Add course"
                : "Save course"}
        </Button>
        {editing && onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
