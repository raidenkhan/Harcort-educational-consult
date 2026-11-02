import Link from "next/link";
import { CalendarClock, Banknote, Send, ArrowRight } from "lucide-react";
import { sessionWhen } from "@/lib/time";
import { formatGhs } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { SessionView } from "@/services/sessions/queries";

/**
 * "At a glance" strip — the student Home tab's first sightline (0039 follow-up).
 *
 * Three questions a student opens the dashboard with, answered in one row:
 *   • when do I next meet my tutor?   → Timetable tab
 *   • how much is still owed?         → Payments tab
 *   • is any request still waiting?   → the requests card right below
 *
 * It is fed from the SAME queries the requests card already runs (the page
 * fetches once and passes the rows down), so the strip costs no extra
 * round trip beyond the timetable read.
 */

/**
 * The next session worth showing — first non-cancelled session that hasn't
 * finished. Module-level so the render stays pure (react-hooks/purity): the
 * clock is read here, once, not inline in JSX.
 */
export function pickNextLesson(sessions: SessionView[]): SessionView | null {
  const now = Date.now();
  return (
    sessions
      .filter((s) => s.status !== "cancelled")
      .filter(
        (s) => new Date(s.scheduled_at).getTime() + s.duration_minutes * 60_000 > now,
      )
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] ?? null
  );
}

/** Outstanding balance across every live agreement. */
function sumOutstanding(remaining: bigint): string | null {
  return remaining > BigInt(0) ? formatGhs(remaining) : null;
}

function Tile({
  href,
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  href: string;
  icon: typeof CalendarClock;
  label: string;
  /** The big line — a time, an amount, a count. */
  value: string;
  /** The smaller line under it. */
  hint: string;
  /** `urgent` turns the tile amber — money is owed, or a lesson is imminent. */
  tone?: "neutral" | "urgent" | "good";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start gap-3 rounded-xl border bg-white/90 px-4 py-3.5 shadow-card backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        tone === "urgent"
          ? "border-amber-300 bg-amber-50/80"
          : tone === "good"
            ? "border-emerald-200"
            : "border-slate-200",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0 rounded-md p-1.5",
          tone === "urgent"
            ? "bg-amber-100 text-amber-700"
            : tone === "good"
              ? "bg-emerald-50 text-emerald-600"
              : "bg-slate-100 text-slate-500",
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {label}
        </span>
        <span className="mt-0.5 block truncate font-display text-sm font-bold text-slate-900">
          {value}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">{hint}</span>
      </span>
      <ArrowRight
        className="ml-auto mt-1 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500"
        aria-hidden
      />
    </Link>
  );
}

export function StudentGlance({
  sessions,
  outstandingPesewas,
  openRequests,
}: {
  sessions: SessionView[];
  /** Sum of `remainingPesewas` across the student's live agreements. */
  outstandingPesewas: bigint;
  /** Requests still waiting on a tutor. */
  openRequests: number;
}) {
  const lesson = pickNextLesson(sessions);
  const due = sumOutstanding(outstandingPesewas);

  return (
    <section aria-label="At a glance" className="mt-8">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        At a glance
      </h2>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile
          href="/dashboard/timetable"
          icon={CalendarClock}
          label="Next lesson"
          value={
            lesson
              ? sessionWhen(new Date(lesson.scheduled_at), lesson.duration_minutes)
              : "Nothing booked yet"
          }
          hint={
            lesson
              ? `${lesson.tutor_name}${lesson.topic ? ` · ${lesson.topic}` : ""}`
              : "Browse tutors to get one on the calendar"
          }
        />
        <Tile
          href="/dashboard/payments"
          icon={Banknote}
          label="Fees due"
          value={due ?? "Paid up"}
          hint={
            due
              ? "Outstanding across your agreements"
              : "Nothing owed right now"
          }
          tone={due ? "urgent" : "good"}
        />
        <Tile
          href="#requests"
          icon={Send}
          label="Requests"
          value={
            openRequests > 0
              ? `${openRequests} waiting on ${openRequests === 1 ? "a tutor" : "tutors"}`
              : "None in flight"
          }
          hint={
            openRequests > 0
              ? "Pay to activate, or withdraw"
              : "Find a tutor to get started"
          }
          tone={openRequests > 0 ? "urgent" : "neutral"}
        />
      </div>
    </section>
  );
}
