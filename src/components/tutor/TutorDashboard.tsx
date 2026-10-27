import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  Inbox,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { TutorDashboardData } from "@/services/tutors/dashboard";
import type { RosterEntry } from "@/services/tutors/roster";
import { formatGhs } from "@/lib/money";
import { accraDate, sessionDateTile, sessionWhen } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { RespondRequestButtons } from "@/components/payments/RespondRequestButtons";
import { TutorPaymentsTable } from "@/components/payments/TutorPaymentsCard";

/**
 * The tutor dashboard — what is actually happening in the tutor's teaching
 * life, in the order they care about it:
 *
 *   1. anything that needs a decision (attendance ticks, pending requests)
 *   2. four numbers: students, money collected, upcoming lessons, requests
 *   3. the next lessons themselves
 *   4. recent payments (who paid, for which course, how much)
 *   5. a compact roster
 *
 * Editing the profile, courses, phone and SMS preferences moved to
 * `/tutor/settings` — a dashboard is for reading and acting, not form fields.
 */

const PAYMENT_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  pending_payment: { label: "Awaiting payment", tone: "amber" },
  active: { label: "Paying", tone: "green" },
  completed: { label: "Paid in full", tone: "brand" },
  cancelled: { label: "Cancelled", tone: "red" },
};

/** One KPI tile — a link, because every number has a place that explains it. */
function Stat({
  href,
  icon: Icon,
  label,
  value,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group block h-full rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Card
        padded={false}
        className="h-full p-4 transition-colors duration-200 group-hover:border-slate-300 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </p>
            <p className="mt-1.5 font-display text-xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-2xl">
              {value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
          <ArrowRight
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors duration-200 group-hover:text-brand-600"
            aria-hidden="true"
          />
        </div>
      </Card>
    </Link>
  );
}

/** Card shell with a title, optional description and a "go deeper" link. */
function SectionCard({
  title,
  description,
  href,
  linkLabel,
  children,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold tracking-tight text-slate-900">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm text-slate-600">{description}</p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 hover:text-brand-800"
          >
            {linkLabel ?? "View all"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-8 text-center text-sm text-slate-500">{children}</p>
  );
}

/** Student hint: only mention states that actually exist for this tutor. */
function studentHint(students: RosterEntry[]): string {
  const paying = students.filter((s) => s.payments?.status === "active").length;
  const awaiting = students.filter(
    (s) => s.payments?.status === "pending_payment",
  ).length;
  const parts = [
    paying > 0 ? `${paying} paying` : null,
    awaiting > 0 ? `${awaiting} awaiting payment` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Your roster is below";
}

export function TutorDashboard({ data }: { data: TutorDashboardData }) {
  const { students, upcoming, awaitingTick, pendingRequests, payments, earnings } =
    data;

  return (
    <div className="mt-8 space-y-6">
      {/* Attendance comes first: a tick is the tutor's proof of work, and it
          is the only thing here that decays if it is forgotten. */}
      {awaitingTick.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">
              {awaitingTick.length} lesson{awaitingTick.length === 1 ? "" : "s"}
            </span>{" "}
            {awaitingTick.length === 1 ? "is" : "are"} waiting for your
            attendance tick.
          </p>
          <Link
            href="/tutor/timetable"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold text-amber-900 underline-offset-2 hover:underline"
          >
            Tick now
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* The four numbers. Two per row on phones keeps the dashboard short;
          a wide money value gets the full tile width instead of clipping. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Stat
          href="/tutor/students"
          icon={Users}
          label="Students"
          value={String(students.length)}
          hint={students.length === 0 ? "None yet" : studentHint(students)}
        />
        <Stat
          href="/tutor/earnings"
          icon={Wallet}
          label="Collected"
          value={formatGhs(earnings.collected)}
          hint={
            earnings.collected > BigInt(0)
              ? `Your share ${formatGhs(earnings.tutorShare)}`
              : "No payments yet"
          }
        />
        <Stat
          href="/tutor/timetable"
          icon={CalendarDays}
          label="Upcoming lessons"
          value={String(upcoming.length)}
          hint={
            upcoming[0]
              ? sessionWhen(
                  new Date(upcoming[0].scheduled_at),
                  upcoming[0].duration_minutes,
                )
              : "Nothing scheduled"
          }
        />
        <Stat
          href="/tutor/students"
          icon={Inbox}
          label="Requests"
          value={String(pendingRequests.length)}
          hint={
            pendingRequests.length > 0
              ? "Waiting for your reply"
              : "No new requests"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard
          title="Next lessons"
          description="Your scheduled sessions, soonest first."
          href="/tutor/timetable"
          linkLabel="Timetable"
        >
          {upcoming.length === 0 ? (
            <EmptyRow>
              Nothing scheduled.{" "}
              <Link
                href="/tutor/timetable"
                className="font-semibold text-brand-700 hover:underline"
              >
                Schedule a session
              </Link>{" "}
              with one of your students.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-slate-100 px-5">
              {upcoming.slice(0, 4).map((session) => {
                const start = new Date(session.scheduled_at);
                const { month, day } = sessionDateTile(start);
                return (
                  <li
                    key={session.id}
                    className="flex items-center gap-3 py-3.5"
                  >
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {month}
                      </span>
                      <span className="font-display text-lg font-bold leading-tight text-slate-900">
                        {day}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {session.topic || "Tutoring session"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {session.student_name || "Student"} ·{" "}
                        {sessionWhen(start, session.duration_minutes)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {upcoming.length > 4 && (
            <div className="border-t border-slate-100 px-5 py-3 text-xs font-medium text-slate-500">
              +{upcoming.length - 4} more scheduled
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Requests"
          description="Students asking for your help."
          href="/tutor/students"
          linkLabel="All requests"
        >
          {pendingRequests.length === 0 ? (
            <EmptyRow>
              No new requests. Students find you in the directory and request
              one of your courses.
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingRequests.slice(0, 3).map((request) => (
                <li key={request.id} className="px-5 py-4">
                  <p className="font-semibold text-slate-900">
                    {request.studentName || "Student"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {request.courseName ?? "Course to agree"} ·{" "}
                    {accraDate(new Date(request.createdAt))}
                  </p>
                  {request.message && (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">
                      &ldquo;{request.message}&rdquo;
                    </p>
                  )}
                  <div className="mt-3">
                    <RespondRequestButtons requestId={request.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {pendingRequests.length > 3 && (
            <div className="border-t border-slate-100 px-5 py-3 text-xs font-medium text-slate-500">
              +{pendingRequests.length - 3} more waiting
            </div>
          )}
        </SectionCard>
      </div>

      {/* Money: who paid, for which course, how much. Payment confirms the
          booking by itself, so this is informational — never an approval. */}
      <TutorPaymentsTable payments={payments} />

      <SectionCard
        title="Your students"
        description="Everyone you are teaching, with their payment status."
        href="/tutor/students"
        linkLabel="Full roster"
      >
        {students.length === 0 ? (
          <EmptyRow>
            No students yet. Accept a request — or wait for a student to pay
            for one of your courses — and they appear here.
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-slate-100">
            {students.slice(0, 5).map((student) => {
              const badge = student.payments
                ? PAYMENT_BADGE[student.payments.status]
                : undefined;
              return (
                <li
                  key={student.studentId}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {student.studentName}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500">
                      <GraduationCap
                        className="h-3 w-3 shrink-0"
                        aria-hidden="true"
                      />
                      {student.courseName ?? "Course to agree"}
                      {student.studentPublicCode
                        ? ` · ${student.studentPublicCode}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {student.nextMeeting && (
                      <span className="text-xs text-slate-500">
                        Next {accraDate(new Date(student.nextMeeting.when))}
                      </span>
                    )}
                    {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
