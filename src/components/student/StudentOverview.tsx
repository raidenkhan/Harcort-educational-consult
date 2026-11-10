import Link from "next/link";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  ChevronRight,
  GraduationCap,
  MessageCircle,
  Search,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatGhs } from "@/lib/money";
import { sessionWhen } from "@/lib/time";
import type { SessionView } from "@/services/sessions/queries";
import {
  orderBookings,
  semestersLabel,
  summarizeBookings,
  type StudentBooking,
} from "@/services/payments/bookings";

function Tile({
  icon: Icon,
  label,
  value,
  note,
  href,
  tint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  href: string;
  tint: string;
}) {
  return (
    <Link href={href} className="block">
      <Card padded={false} hover className="flex h-full items-start gap-3 p-4">
        <span className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-md sm:flex ${tint}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </span>
          <span className="mt-0.5 block truncate font-display text-lg font-bold leading-tight text-slate-900">
            {value}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{note}</span>
        </span>
      </Card>
    </Link>
  );
}

const MODE_LABEL = { one_on_one: "One-on-one", group: "Group" } as const;

/**
 * The student Home overview: what they've booked (courses, tutors),
 * the next lesson, anything waiting for payment, every booking in one list,
 * and the doors to everything else they can do.
 */
export function StudentOverview({
  bookings,
  nextLesson,
}: {
  bookings: StudentBooking[];
  nextLesson: SessionView | null;
}) {
  const summary = summarizeBookings(bookings);
  const list = orderBookings(bookings);

  return (
    <div>
      {/* ── At a glance ─────────────────────────────────────────── */}
      <section aria-label="At a glance">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
          <Tile
            icon={BookOpen}
            label="Courses booked"
            value={String(summary.coursesBooked)}
            note={summary.coursesBooked === 0 ? "Book your first course" : "Paid and confirmed"}
            href="/dashboard/courses"
            tint="bg-brand-50 text-brand-700"
          />
          <Tile
            icon={GraduationCap}
            label="Tutors"
            value={String(summary.tutorsBooked)}
            note={summary.tutorsBooked === 1 ? "tutor teaching you" : "tutors teaching you"}
            href="/dashboard/messages"
            tint="bg-petrol-50 text-petrol-700"
          />
          <Tile
            icon={CalendarClock}
            label="Next lesson"
            value={nextLesson ? nextLesson.tutor_name : "Nothing booked"}
            note={
              nextLesson
                ? sessionWhen(new Date(nextLesson.scheduled_at), nextLesson.duration_minutes)
                : "Your tutor schedules sessions"
            }
            href="/dashboard/timetable"
            tint="bg-amber-50 text-amber-700"
          />
        </div>
      </section>

      {/* ── Waiting for payment ─────────────────────────────────── */}
      {summary.awaitingCount > 0 && (
        <Link
          href="/dashboard/payments"
          className="mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <strong>
              {summary.awaitingCount} booking{summary.awaitingCount === 1 ? "" : "s"} waiting for payment
            </strong>
            {summary.awaitingPesewas > BigInt(0) && ` · ${formatGhs(summary.awaitingPesewas)} to pay`}
            {" — your sessions are confirmed once it's paid."}
          </span>
          <span className="shrink-0 font-semibold">Pay now</span>
        </Link>
      )}

      {/* ── My bookings ─────────────────────────────────────────── */}
      <section aria-label="My bookings" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">My bookings</h2>
          <Link
            href="/dashboard/courses"
            className="text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            Book a course →
          </Link>
        </div>

        {list.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center">
            <p className="text-sm text-slate-600">
              You haven&apos;t booked a course yet. Pick a course, choose one of
              its tutors, and pay to confirm.
            </p>
            <Link
              href="/dashboard/courses"
              className="mt-4 inline-flex h-10 items-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs hover:bg-brand-700"
            >
              Book a course
            </Link>
          </div>
        ) : (
          <Card padded={false} className="mt-4 divide-y divide-slate-100 overflow-hidden">
            {list.map((b) => {
              const awaiting = b.status === "pending_payment";
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {b.courseCode && (
                        <span className="mr-1.5 rounded-[2px] bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand-800">
                          {b.courseCode}
                        </span>
                      )}
                      {b.courseName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      with <span className="font-medium text-slate-700">{b.tutorName}</span>
                      {b.sessionMode && ` · ${MODE_LABEL[b.sessionMode]}`}
                      {` · ${semestersLabel(b.semesters)}`}
                      {` · ${formatGhs(b.agreedTotal)}`}
                    </p>
                  </div>
                  {awaiting ? (
                    <Link
                      href="/dashboard/payments"
                      className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Pay now <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : (
                    <Badge tone={b.status === "completed" ? "brand" : "green"}>
                      {b.status === "completed" ? "Completed" : "Confirmed"}
                    </Badge>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>

      {/* ── What you can do ─────────────────────────────────────── */}
      <section aria-label="What you can do" className="mt-10">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">What you can do</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { href: "/dashboard/courses", icon: BookOpen, title: "Book a course", body: "Pick a course, choose a tutor, pay in one step." },
            { href: "/tutors", icon: Search, title: "Browse all tutors", body: "Compare tutors' courses, formats and prices." },
            { href: "/dashboard/messages", icon: MessageCircle, title: "Message your tutors", body: "Ask questions and agree session times." },
            { href: "/dashboard/groups", icon: Users, title: "Study groups", body: "Learn alongside classmates on the same course." },
          ].map((action) => (
            <Link key={action.href} href={action.href} className="block">
              <Card padded={false} hover className="flex h-full items-start gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                  <action.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{action.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{action.body}</span>
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
