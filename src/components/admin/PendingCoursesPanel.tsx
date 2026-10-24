import { Check, GraduationCap, X } from "lucide-react";
import { approveCourse, rejectCourse } from "@/services/courses/mutations";
import type { PendingCourse } from "@/services/courses/queries";
import { levelLabel } from "@/components/home/courseTaxonomy";
import { Card } from "@/components/ui/Card";

/**
 * Tutor-added courses waiting for review (0031).
 *
 * A tutor can add a course the catalog doesn't have — it is created with
 * `is_approved = false`, so it is usable for their own offering immediately but
 * never appears in the public directory until an admin approves it. This is the
 * queue that closes that loop.
 *
 * Rejecting DELETES the course (and cascades the tutor's offering for it): a
 * refused course has no reason to linger, and leaving it unpublished would just
 * let the tutor keep teaching something nobody approved.
 *
 * Plain forms, no client component — approve/reject are two buttons and a
 * router refresh.
 */
export function PendingCoursesPanel({ courses }: { courses: PendingCourse[] }) {
  return (
    <section aria-label="Courses awaiting review" className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Course catalog
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
            Courses added by tutors
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Tutors can add a course the catalog is missing. It is hidden from the
            public directory until you approve it — approving publishes it
            everywhere; rejecting deletes it and the tutor&apos;s offer for it.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {courses.length} waiting
        </span>
      </div>

      {courses.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          Nothing waiting — every tutor-added course has been reviewed.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {courses.map((course) => (
            <li key={course.id}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs font-semibold text-brand-700">
                      {course.code ?? "No code"}
                    </span>
                    <span className="text-sm font-semibold text-slate-900">
                      {course.name}
                    </span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" />
                      {course.subject}
                    </span>
                    <span>·</span>
                    <span>{course.year ? levelLabel(course.year) : "All levels"}</span>
                    <span>·</span>
                    <span>
                      {course.semester ? `Semester ${course.semester}` : "Both semesters"}
                    </span>
                    {course.addedBy && (
                      <>
                        <span>·</span>
                        <span>added by {course.addedBy}</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <form action={approveCourse}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 active:scale-[0.98]"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve
                    </button>
                  </form>
                  <form action={rejectCourse}>
                    <input type="hidden" name="courseId" value={course.id} />
                    <button
                      type="submit"
                      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 active:scale-[0.98]"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
