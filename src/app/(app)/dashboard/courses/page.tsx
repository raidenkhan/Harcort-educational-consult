import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";
import { listCourses } from "@/services/courses/queries";
import {
  sortFields,
  groupCoursesForPicker,
  engineeringCourses,
} from "@/components/home/courseTaxonomy";
import { StudyPrefsPicker } from "@/components/auth/StudyPrefsPicker";

/**
 * Student dashboard — Courses. Per-program personalization (board flow:
 * Program → Year → Course → Materials → Tutors). Students pick what they
 * study and the year they're in; the page lists that program's courses
 * grouped by term, and each course page carries its materials + tutors.
 */
export default async function StudentCoursesPage() {
  const profile = await requireProfile();
  // Student surface only — the tab is hidden for admins and a tutor's
  // dashboard is `/tutor`.
  if (profile.role !== "student") redirect("/dashboard");

  const allCourses = await listCourses();
  const courses = engineeringCourses(allCourses);

  const programSubjects = sortFields(
    Array.from(new Set(courses.map((c) => c.subject))),
  );
  const programCourses = profile.program
    ? courses.filter((c) => c.subject === profile.program)
    : [];
  // Year tier: once a student picks a year, hide other years' courses and
  // keep the year-less (general) ones; no year yet shows the whole program.
  const yearCourses = profile.program
    ? programCourses.filter(
        (c) => profile.year == null || c.year == null || c.year === profile.year,
      )
    : [];
  // Grouped by TERM, not one flat list: a KNUST year carries roughly eight
  // courses per semester, so "all of Level 200 at once" buries the structure
  // the student is actually working in. The buckets are
  // "Level 200 · Semester 1" / "… Semester 2" / "… Both semesters", the same
  // vocabulary as the /courses directory and the tutor's course picker.
  const courseBuckets = groupCoursesForPicker(yearCourses);

  return (
    <section className="mt-10">
      <div className="max-w-2xl">
        <StudyPrefsPicker
          key={`${profile.program ?? "none"}-${profile.year ?? "any"}`}
          programs={programSubjects}
          currentProgram={profile.program ?? null}
          currentYear={profile.year ?? null}
        />
      </div>

      {profile.program && (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline gap-3 border-b border-slate-200 pb-2">
            <h3 className="font-display text-lg font-semibold text-slate-900">
              {profile.program}
            </h3>
            {profile.year != null && (
              <span className="text-sm font-medium text-slate-500">
                · Year {profile.year}
              </span>
            )}
            <span className="ml-auto text-xs font-medium uppercase tracking-widest text-slate-400">
              {yearCourses.length}{" "}
              {yearCourses.length === 1 ? "course" : "courses"}
            </span>
          </div>
          {yearCourses.length === 0 ? (
            <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
              No courses listed for {profile.program}
              {profile.year != null ? ` Year ${profile.year}` : ""} yet —
              check back soon, or browse all courses.
            </p>
          ) : (
            <div className="mt-4 space-y-8">
              {courseBuckets.map((bucket) => (
                <div key={bucket.key}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      {bucket.label}
                    </h4>
                    <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
                      {bucket.items.length}{" "}
                      {bucket.items.length === 1 ? "course" : "courses"}
                    </span>
                  </div>
                  <ul className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {bucket.items.map((course) => (
                      <li key={course.id} className="h-full">
                        <Link
                          href={`/courses/${course.id}`}
                          className="group flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                        >
                          {course.code && (
                            <span className="mb-1 flex flex-wrap items-center gap-2">
                              <span className="rounded-[2px] bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand-800">
                                {course.code}
                              </span>
                              {course.credits != null && (
                                <span className="text-[11px] text-slate-400">
                                  {course.credits} credit hour
                                  {course.credits === 1 ? "" : "s"}
                                </span>
                              )}
                            </span>
                          )}
                          <span className="font-display text-base font-semibold leading-snug text-slate-900">
                            {course.name}
                          </span>
                          {course.description && (
                            <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
                              {course.description}
                            </span>
                          )}
                          <span className="mt-auto pt-3 text-sm font-semibold text-brand-600 transition-colors group-hover:text-brand-700">
                            Materials &amp; tutors →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
