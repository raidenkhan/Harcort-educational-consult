import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, Settings } from "lucide-react";
import { requireProfile } from "@/services/auth/queries";
import { listCourses } from "@/services/courses/queries";
import { offeringsByCourse } from "@/services/courses/offerings";
import { safeListApprovedTutors } from "@/services/tutors/queries";
import { listStudentBookings } from "@/services/payments/queries";
import { bookedTutorKeys } from "@/services/payments/bookings";
import {
  engineeringCourses,
  groupCoursesForPicker,
  YEARS,
} from "@/components/home/courseTaxonomy";
import { CourseTutorRow } from "@/components/courses/CourseTutorRow";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/**
 * Student dashboard — Courses: where booking happens.
 *
 * The student's programme is set in Settings (their account is associated
 * with it); this page shows that programme's courses, grouped by semester,
 * and under EACH course the tutors who teach it, each with "Choose & pay".
 * Year and semester are filters here (?year=1..4, ?semester=1|2, both
 * default to all) — not saved settings. The course name opens the course page (notes, videos, the
 * same tutors).
 */
export default async function StudentCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; semester?: string }>;
}) {
  const profile = await requireProfile();
  // Student surface only — the tab is hidden for admins and a tutor's
  // dashboard is `/tutor`.
  if (profile.role !== "student") redirect("/dashboard");

  if (!profile.program) {
    return (
      <Card className="text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-brand-600" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl font-bold text-slate-900">
          Choose your programme first
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
          Set the programme you study in Settings. Your Courses page then shows
          its courses and the tutors you can book for each one.
        </p>
        <Link
          href="/dashboard/settings"
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs hover:bg-brand-700"
        >
          <Settings className="h-4 w-4" aria-hidden="true" /> Go to Settings
        </Link>
      </Card>
    );
  }

  const { year: yearParam, semester: semesterParam } = await searchParams;
  const yearFilter = YEARS.find((y) => String(y) === yearParam) ?? null;
  const semesterFilter = semesterParam === "1" ? 1 : semesterParam === "2" ? 2 : null;

  const [allCourses, tutors, bookings] = await Promise.all([
    listCourses(),
    safeListApprovedTutors(),
    listStudentBookings(profile),
  ]);

  const programCourses = engineeringCourses(allCourses).filter(
    (c) => c.subject === profile.program,
  );
  // Both filters keep courses that aren't tied to one (year-less, or running
  // in both semesters) visible.
  const visible = programCourses
    .filter((c) => !yearFilter || c.year == null || c.year === yearFilter)
    .filter((c) => !semesterFilter || c.semester == null || c.semester === semesterFilter);
  const buckets = groupCoursesForPicker(visible);
  const offerings = offeringsByCourse(tutors, visible);
  const tutorById = new Map(tutors.map((t) => [t.tutorProfile.id, t]));
  const withTutors = visible.filter((c) => (offerings[c.id]?.length ?? 0) > 0).length;

  const yearOptions = [
    { value: null, label: "All years" },
    ...YEARS.map((y) => ({ value: y, label: `Year ${y}` })),
  ];
  const semesterOptions = [
    { value: null, label: "Both semesters" },
    { value: 1, label: "Semester 1" },
    { value: 2, label: "Semester 2" },
  ];
  /** A filter link that keeps the other filter as it is. */
  const filterHref = (year: number | null, semester: number | null) => {
    const params = new URLSearchParams();
    if (year) params.set("year", String(year));
    if (semester) params.set("semester", String(semester));
    const q = params.toString();
    return q ? `/dashboard/courses?${q}` : "/dashboard/courses";
  };

  return (
    <div>
      {/* ── Programme (from Settings) + year filter ─────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Your programme
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900">
            {profile.program}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {visible.length} course{visible.length === 1 ? "" : "s"} · {withTutors} with tutors ·{" "}
            <Link href="/dashboard/settings" className="font-medium text-brand-700 hover:underline">
              Change in Settings
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <nav aria-label="Filter by year" className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {yearOptions.map((option) => {
              const active = option.value === yearFilter;
              return (
                <Link
                  key={option.label}
                  href={filterHref(option.value, semesterFilter)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-petrol-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>
          <nav aria-label="Filter by semester" className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {semesterOptions.map((option) => {
              const active = option.value === semesterFilter;
              return (
                <Link
                  key={option.label}
                  href={filterHref(yearFilter, option.value)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    active ? "bg-petrol-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* ── Courses, each with its tutors ───────────────────────── */}
      {visible.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
          No courses listed for {profile.program}
          {yearFilter ? ` Year ${yearFilter}` : ""}
          {semesterFilter ? `, Semester ${semesterFilter}` : ""} yet.
        </p>
      ) : (
        <div className="mt-8 space-y-10">
          {buckets.map((bucket) => (
            <section key={bucket.key} aria-label={bucket.label}>
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {bucket.label}
                </h3>
                <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
                  {bucket.items.length} {bucket.items.length === 1 ? "course" : "courses"}
                </span>
              </div>

              <ul className="mt-3 space-y-3">
                {bucket.items.map((course) => {
                  const courseOfferings = offerings[course.id] ?? [];
                  const booked = bookedTutorKeys(bookings, course);
                  return (
                    <li key={course.id}>
                      <Card padded={false} className="overflow-hidden">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
                          {course.code && (
                            <span className="rounded-[2px] bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand-800">
                              {course.code}
                            </span>
                          )}
                          <Link
                            href={`/dashboard/courses/${course.id}`}
                            className="font-display text-base font-semibold text-slate-900 hover:text-brand-700"
                          >
                            {course.name}
                          </Link>
                          {course.credits != null && (
                            <span className="text-xs text-slate-400">
                              {course.credits} credit hour{course.credits === 1 ? "" : "s"}
                            </span>
                          )}
                        </div>

                        {courseOfferings.length === 0 ? (
                          <p className="px-5 pb-4 pt-2 text-xs text-slate-500">
                            No tutor teaches this course yet.
                          </p>
                        ) : (
                          <div className="mt-1 divide-y divide-slate-100 border-t border-slate-100 px-5">
                            {courseOfferings.map((offering) => (
                              <CourseTutorRow
                                key={offering.tutorServiceId}
                                offering={offering}
                                tutor={tutorById.get(offering.tutorProfileId)}
                                booked={booked.has(offering.tutorCode ?? offering.tutorName)}
                                courseCode={course.code ?? null}
                                compact
                              />
                            ))}
                          </div>
                        )}
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
