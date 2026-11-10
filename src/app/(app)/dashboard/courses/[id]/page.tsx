import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { requireProfile } from "@/services/auth/queries";
import { getCourseById } from "@/services/courses/queries";
import { offeringsByCourse } from "@/services/courses/offerings";
import { normalizeCourseCode } from "@/services/courses/codes";
import { safeListApprovedTutors } from "@/services/tutors/queries";
import { listStudentBookings } from "@/services/payments/queries";
import { levelLabel } from "@/components/home/courseTaxonomy";
import { BookTutorButton } from "@/components/tutors/BookTutorButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";

const cedis = (n: number) => `GH₵${n.toLocaleString("en-GH")}`;

/**
 * Dashboard → Courses → one course: the course, then every tutor who teaches
 * it, each with "Choose & pay" — the Book-tutor dialog opened on THIS course
 * (format, semesters, live total, one Paystack charge via startCartCheckout).
 *
 * Tutors are matched by normalised course CODE (offeringsByCourse), because
 * one real course has a row per programme: a tutor who listed ME 261 under
 * Mechanical still appears on Marine's ME 261.
 */
export default async function DashboardCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/dashboard");
  const { id } = await params;

  const [course, tutors, bookings] = await Promise.all([
    getCourseById(id),
    safeListApprovedTutors(),
    listStudentBookings(profile),
  ]);
  if (!course) notFound();

  const offerings = offeringsByCourse(tutors, [course])[course.id] ?? [];
  const tutorById = new Map(tutors.map((t) => [t.tutorProfile.id, t]));
  const code = normalizeCourseCode(course.code);

  // Tutors this student already booked for this course (not cancelled).
  const bookedTutorCodes = new Set(
    bookings
      .filter(
        (b) =>
          b.status !== "cancelled" &&
          (code
            ? normalizeCourseCode(b.courseCode) === code
            : b.courseName.trim().toLowerCase() === course.name.trim().toLowerCase()),
      )
      .map((b) => b.tutorCode ?? b.tutorName),
  );

  const facts = [
    course.credits != null ? `${course.credits} credit hour${course.credits === 1 ? "" : "s"}` : null,
    course.year != null ? levelLabel(course.year) : null,
    course.semester ? `Semester ${course.semester}` : null,
    course.subject,
  ].filter(Boolean);

  return (
    <div>
      <Link
        href="/dashboard/courses"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All courses
      </Link>

      {/* ── The course ─────────────────────────────────────────── */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {course.code && (
              <span className="rounded-[2px] bg-brand-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-800">
                {course.code}
              </span>
            )}
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
              {course.name}
            </h2>
            {facts.length > 0 && (
              <p className="mt-1 text-sm text-slate-500">{facts.join(" · ")}</p>
            )}
          </div>
          <Link
            href={`/courses/${course.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            Notes &amp; videos <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {course.description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600">{course.description}</p>
        )}
      </Card>

      {/* ── Its tutors ─────────────────────────────────────────── */}
      <section className="mt-10" aria-label="Tutors for this course">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Tutors for this course{" "}
          <span className="text-base font-semibold text-slate-400">({offerings.length})</span>
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Choose a tutor, pick one-on-one or group and how many semesters, then
          pay to confirm. Prices are per semester; the processing fee is shown
          before you pay.
        </p>

        {offerings.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-600">
            No tutor teaches this course yet.{" "}
            <Link href="/tutors" className="font-semibold text-brand-700 hover:underline">
              Browse all tutors
            </Link>{" "}
            or message the admin team to request one.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {offerings.map((offering) => {
              const tutor = tutorById.get(offering.tutorProfileId);
              const booked = bookedTutorCodes.has(offering.tutorCode ?? offering.tutorName);
              const about = tutor?.tutorProfile.qualifications || tutor?.tutorProfile.bio;
              return (
                <li key={offering.tutorServiceId}>
                  <Card className="flex flex-wrap items-center gap-4">
                    <TutorAvatar
                      name={offering.tutorName}
                      src={tutor?.profile.avatar_url}
                      size={48}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
                        {offering.tutorName}
                        {tutor?.profile.is_admin && <VerifiedBadge />}
                      </p>
                      {about && (
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{about}</p>
                      )}
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                        {offering.priceOneOnOne !== null && (
                          <span>
                            One-on-one{" "}
                            <span className="font-semibold text-slate-900">
                              {cedis(offering.priceOneOnOne)}
                            </span>
                            /semester
                          </span>
                        )}
                        {offering.priceGroup !== null && (
                          <span>
                            Group{" "}
                            <span className="font-semibold text-slate-900">
                              {cedis(offering.priceGroup)}
                            </span>
                            /semester
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {booked && (
                        <Badge tone="green">
                          <CheckCircle2 className="mr-1 inline h-3 w-3" aria-hidden="true" />
                          Booked
                        </Badge>
                      )}
                      <BookTutorButton
                        tutorName={offering.tutorName}
                        offerings={[offering]}
                        initialSelected={[offering.tutorServiceId]}
                        signedIn
                        label={booked ? "Book again" : "Choose & pay"}
                        className="h-10 px-4"
                      />
                      {offering.tutorCode && (
                        <Link
                          href={`/tutors/${offering.tutorCode}${course.code ? `?course=${encodeURIComponent(course.code)}` : ""}`}
                          className="text-xs font-medium text-slate-500 hover:text-slate-800"
                        >
                          View profile
                        </Link>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
