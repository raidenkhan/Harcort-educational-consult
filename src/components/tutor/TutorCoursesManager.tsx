"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import type { Course } from "@/types";
import type { OwnTutorService } from "@/services/tutors/queries";
import { ServicePrice } from "@/components/tutors/ServicePrice";
import { CopyServiceLink } from "@/components/tutor/CopyServiceLink";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TutorServiceForm, type ServiceToEdit } from "./TutorServiceForm";

/**
 * Course management on the tutor Overview tab — one card that shows BOTH the
 * add/edit form and the list of existing services.
 *
 * The list's "Edit" button swaps the form above into edit mode for that
 * course (the course is fixed; the tutor changes how it's offered — one-on-one,
 * group or both — and its price). `addTutorService` already re-prices an
 * existing (tutor, course) pair, so editing is the same action with the
 * course id locked.
 */
export function TutorCoursesManager({
  courses,
  services,
  publicCode,
}: {
  courses: Course[];
  services: OwnTutorService[];
  publicCode: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const router = useRouter();

  const editing = services.find((s) => s.id === editingId) ?? null;

  const initial: ServiceToEdit | undefined = editing
    ? {
        courseId: editing.course_id,
        courseName: editing.course?.name ?? "This course",
        courseCode: editing.course?.code ?? null,
        priceOneOnOne: editing.price_one_on_one ?? null,
        priceGroup: editing.price_group ?? null,
      }
    : undefined;

  const onSaved = useCallback(() => {
    setEditingId(null);
    router.refresh();
  }, [router]);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-900">
        Courses you teach
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Add the courses you&apos;re willing to tutor, with your price per
        semester and how you offer each — one-on-one, group, or both. Students
        request these directly.
      </p>

      {editing && (
        <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3">
          <p className="text-sm font-semibold text-brand-900">
            Editing {initial!.courseCode ? `${initial!.courseCode} — ` : ""}
            {initial!.courseName}
          </p>
          <p className="mt-0.5 text-xs text-brand-800">
            Change how it&apos;s offered or its price, then save. Leaving a
            format out removes it from your offer.
          </p>
        </div>
      )}

      {/* Keyed on the course being edited so switching between add and edit
          (or between two courses) remounts the form with fresh defaults. */}
      <TutorServiceForm
        key={initial?.courseId ?? "add"}
        courses={courses}
        initial={initial}
        onCancel={() => setEditingId(null)}
        onSaved={onSaved}
      />

      <div className="mt-8 border-t border-slate-100 pt-6">
        <h3 className="text-base font-semibold text-slate-900">Your services</h3>
        {services.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No courses added yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {services.map((service) => (
              <li key={service.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {service.course?.code && (
                      <span className="mr-2 font-mono text-xs text-slate-400">
                        {service.course.code}
                      </span>
                    )}
                    {service.course?.name ?? "Unknown course"}
                  </span>
                  {service.course?.is_approved === false && (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      awaiting review
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <ServicePrice service={service} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingId(service.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {publicCode && service.course && (
                    <CopyServiceLink
                      publicCode={publicCode}
                      course={{
                        id: service.course.id,
                        code: service.course.code ?? null,
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
