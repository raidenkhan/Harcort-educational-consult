import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import { listCourses } from "@/services/courses/queries";
import { sortFields, groupCoursesForPicker, engineeringCourses } from "@/components/home/courseTaxonomy";
import {
  listSessionsForStudent,
  type SessionView,
} from "@/services/sessions/queries";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { SessionCard } from "@/components/sessions/SessionCard";
import { TimetableViews } from "@/components/sessions/TimetableViews";
import { PaymentGroundRules } from "@/components/support/PaymentGroundRules";
import { StudentPaymentsCard } from "@/components/payments/StudentPaymentsCard";
import { StudentRequestsCard } from "@/components/payments/StudentRequestsCard";
import { RoleSwitcher } from "@/components/auth/RoleSwitcher";
import { StudyPrefsPicker } from "@/components/auth/StudyPrefsPicker";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { SmsPreferenceForm } from "@/components/auth/SmsPreferenceForm";
import { accraDate } from "@/lib/time";

/** Sessions can be ticked from 15 minutes before their start time. */
const GRACE_MS = 15 * 60 * 1000;

/** Module-level splits so the render stays pure (React Compiler lint). */
function splitStudentTimetable(sessions: SessionView[]) {
  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduled_at).getTime() > now + GRACE_MS,
  );
  const other = sessions.filter((s) => !upcoming.includes(s));
  return { now, upcoming, other };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; payment_status?: string }>;
}) {
  const profile = await requireProfile();

  // ONE dashboard per role. A tutor's dashboard is `/tutor` (students, lessons,
  // money, requests) — this page is the student surface, so a tutor landing
  // here (a bookmark, an old link, the post-sign-in default) is sent to the
  // real one instead of being shown a second, older dashboard.
  if (profile.role === "tutor") redirect("/tutor");

  const params = await searchParams;
  const paymentReturn = params.payment === "return";
  const paymentConfirmed = params.payment_status === "received";
  // Paystack took the money but our ledger refused to credit it (an overpay, a
  // currency mismatch, a settled installment). The sweep cannot fix it — a
  // human has to reconcile — so the student must not be told to wait.
  const paymentRefused = params.payment_status === "refused";

  const [studentSessions, allCourses] = await Promise.all([
    profile.role === "student" ? listSessionsForStudent() : Promise.resolve([]),
    profile.role === "student" ? listCourses() : Promise.resolve([]),
  ]);
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

  const studentTimetable =
    profile.role === "student" ? splitStudentTimetable(studentSessions) : null;
  const upcomingSessions = studentTimetable?.upcoming ?? [];
  const otherSessions = studentTimetable?.other ?? [];

  const roleHeading: Record<string, string> = {
    student: "Find the right tutor for every course.",
    admin: "Run the platform. Approve tutors, review reports.",
  };

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-6 sm:py-12">
        <PageHeader
          title={`Welcome, ${profile.full_name.split(" ")[0]}.`}
          description={roleHeading[profile.role]}
          actions={
            profile.public_code ? (
              <p
                className="rounded-md border border-slate-200 bg-white/70 px-3 py-1.5 font-mono text-xs tracking-wide tabular-nums text-slate-500"
                title="Your Harcourt tracking code — quote it whenever you contact support or an admin about payments"
              >
                {profile.public_code}
              </p>
            ) : null
          }
        />

        {/* Back from Paystack. `/api/payments/return` already verified the
            charge and applied it, so "received" is the normal happy path;
            "pending" means Paystack had not settled it yet (or verify was
            momentarily unavailable) and the sweep will retry; "refused" means
            the charge is real but the ledger rejected it, which only a human
            can resolve. */}
        {paymentReturn && (
          <div
            className={
              paymentConfirmed
                ? "mt-6 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
                : paymentRefused
                  ? "mt-6 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  : "mt-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            }
          >
            {paymentConfirmed ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : paymentRefused ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>
              {paymentConfirmed
                ? "Payment received — your booking is confirmed. We've emailed you and your tutor."
                : paymentRefused
                  ? "Your payment went through, but we couldn't apply it to your account automatically. Please contact the admin team with your Paystack reference so we can credit it."
                  : "Paystack sent you back. We're confirming the payment with Paystack — refresh in a minute if it doesn't show below."}
            </span>
          </div>
        )}

        {/* Urgent first: an open request is the thing a student most needs to
            see — it carries the paywall and the "pay now" button. The ground
            rules note sits right after it because it explains that payment
            policy, then the courses follow. */}
        {profile.role === "student" && (
          <div className="mt-10">
            <StudentRequestsCard hideWhenEmpty />
          </div>
        )}
        {profile.role === "student" && <PaymentGroundRules className="mt-8" />}

        {/* Your program — per-program personalization (board flow: Program →
            Year → Course → Materials → Tutors). Students pick what they study
            and the year they're in; the dashboard leads with that program's
            courses, and each course page carries its materials + tutors. */}
        {profile.role === "student" && (
          <section id="program" className="mt-10 scroll-mt-28">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
              Your program
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
              Courses for your program
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Pick your program and year and we&apos;ll list its courses first —
              every course page has the materials and the tutors who teach it.
            </p>
            <div className="mt-4 max-w-2xl">
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
        )}

        {/* The money view: engagements + semester fee + pay buttons. */}
        {profile.role === "student" && (
          <div className="mt-10">
            <StudentPaymentsCard />
          </div>
        )}

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {profile.role === "student" && (
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">Find a tutor</h2>
              <p className="mt-1 text-sm text-slate-600">
                Browse approved tutors by subject and course, then reach out
                when you find the right match.
              </p>
              <Link href="/tutors" className="mt-4 block">
                <Button className="w-full sm:w-auto">Browse tutors</Button>
              </Link>
            </Card>
          )}

          {profileIsAdmin(profile) && (
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">
                Tutor applications
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Review new tutor applications, approve or reject them, and
                keep an eye on attendance.
              </p>
              <Link href="/admin" className="mt-4 block">
                <Button className="w-full sm:w-auto">Open admin console</Button>
              </Link>
            </Card>
          )}

          {profile.role === "student" && (
            <RoleSwitcher currentRole={profile.role} />
          )}

      {/* Phone (0022) — where session text updates go. Optional for every
          role; an empty value clears the number. The opt-out switch (0027)
          sits with it: the number and the permission to use it are one
          decision. */}
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">
          Phone number &amp; text alerts
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          We text session updates to this number. Optional — add or remove it
          any time, and switch the texts off entirely below.
        </p>
        <div className="mt-3">
          <PhoneForm key={profile.phone ?? "none"} current={profile.phone} />
        </div>
        <div className="mt-6 border-t border-slate-100 pt-5">
          <SmsPreferenceForm optedOut={profile.sms_opt_out ?? false} />
        </div>
      </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-900">Account</h2>
            <dl className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Role</dt>
                <dd className="flex items-center gap-1.5 font-medium capitalize text-slate-900">
                  {profile.role}
                  {profileIsAdmin(profile) && <VerifiedBadge />}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Name</dt>
                <dd className="font-medium text-slate-900">{profile.full_name}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Member since</dt>
                <dd className="font-medium text-slate-900">
                  {accraDate(new Date(profile.created_at))}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        {/* ── Student timetable ────────────────────────────────────── */}
        {profile.role === "student" && (
          <section id="timetable" className="mt-14 scroll-mt-28">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                  Your sessions
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
                  Timetable with your tutors
                </h2>
                <p className="mt-1 max-w-xl text-sm text-slate-600">
                  Your tutor schedules sessions here. Tick attendance when you
                  meet — it confirms the session happened on the admin side.
                </p>
              </div>
              {upcomingSessions.length > 0 && (
                <Badge tone="petrol">{upcomingSessions.length} upcoming</Badge>
              )}
            </div>

            {studentSessions.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
                <p className="text-sm text-slate-500">
                  No sessions yet. Find a tutor, start a conversation, and your
                  tutor will schedule sessions here.
                </p>
              </div>
            ) : (
              <TimetableViews
                sessions={studentSessions}
                now={studentTimetable!.now}
                counterpartLabel="tutor"
                listView={
                <div className="mt-6 space-y-4">
                {upcomingSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    role="student"
                    now={studentTimetable!.now}
                  />
                ))}
                {otherSessions.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Past &amp; in progress
                    </h3>
                    <div className="mt-3 space-y-4">
                      {otherSessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          role="student"
                          now={studentTimetable!.now}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
                }
              />
            )}
          </section>
        )}
      </Container>
    </div>
  );
}
