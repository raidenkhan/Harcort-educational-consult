import { CalendarClock, CircleCheck, ListChecks } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import { listTutorRoster, type RosterEntry } from "@/services/tutors/roster";
import { formatGhs } from "@/lib/money";
import { sessionWhen } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * Tutor roster — "My students" on the tutor page. One card per student:
 * identity (name + tracking code), payment progress against the 50/50
 * plan, the next meeting, and the topics already dual-ticked as finished.
 */

const PAYMENT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending_payment: { label: "Awaiting first payment", tone: "amber" },
  active: { label: "Paying", tone: "green" },
  completed: { label: "Fully paid", tone: "brand" },
  cancelled: { label: "Cancelled", tone: "red" },
};

/** Module-level (react-hooks/purity): snapshot the clock once. */
function withDerived(entries: RosterEntry[]) {
  const now = Date.now();
  return entries.map((entry) => ({
    ...entry,
    payments: entry.payments
      ? {
          ...entry.payments,
          installments: entry.payments.installments.map((i) => ({
            ...i,
            displayStatus:
              i.status === "pending" && isOverdue(i.dueAt, now) ? ("overdue" as const) : i.status,
          })),
        }
      : null,
  }));
}

function isOverdue(dueAt: string, now: number): boolean {
  const due = new Date(dueAt);
  const dueDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(due);
  const todayDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Accra",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  return dueDay < todayDay;
}

export async function TutorRoster() {
  const profile = await requireRole("tutor");
  const entries = withDerived(await listTutorRoster(profile));

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
        No students yet — accept a tutoring request and the student appears
        here with their payments, topics, and meeting times.
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {entries.map((entry) => {
        const payBadge = entry.payments
          ? (PAYMENT_BADGE[entry.payments.status] ?? {
              label: entry.payments.status,
              tone: "neutral" as const,
            })
          : null;
        return (
          <li key={entry.studentId}>
            <Card>
              {/* Identity + status row */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900">{entry.studentName}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Code {entry.studentPublicCode ?? "—"}
                    {entry.courseName ? ` · ${entry.courseName}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {payBadge && <Badge tone={payBadge.tone}>{payBadge.label}</Badge>}
                  {entry.upcomingCount > 0 && (
                    <Badge tone="petrol">
                      <CalendarClock className="mr-1 h-3 w-3" />
                      {entry.upcomingCount} upcoming
                    </Badge>
                  )}
                </div>
              </div>

              {/* Payments */}
              {entry.payments && (
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-700">
                      {formatGhs(entry.payments.paid)} paid of{" "}
                      {formatGhs(entry.payments.agreedTotal)}
                    </span>
                    {entry.payments.remaining > BigInt(0) && (
                      <span className="text-xs text-slate-500">
                        {formatGhs(entry.payments.remaining)} remaining
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {entry.payments.installments.map((i) => (
                      <Badge
                        key={i.idx}
                        tone={
                          i.displayStatus === "paid"
                            ? "green"
                            : i.displayStatus === "overdue"
                              ? "red"
                              : "neutral"
                        }
                      >
                        Inst. {i.idx} · {formatGhs(i.amount)} ·{" "}
                        {i.displayStatus === "paid"
                          ? "Paid"
                          : i.displayStatus === "overdue"
                            ? "Overdue"
                            : `Due ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Accra" }).format(new Date(i.dueAt))}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Meetings + topics grid */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Meeting times
                  </p>
                  {entry.nextMeeting ? (
                    <p className="mt-1.5 text-sm text-slate-700">
                      <CalendarClock className="mr-1.5 inline h-3.5 w-3.5 text-slate-400" />
                      {sessionWhen(new Date(entry.nextMeeting.when), 60)}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm text-slate-500">
                      No upcoming session — schedule one from the timetable.
                    </p>
                  )}
                  {entry.upcomingCount > 1 && (
                    <p className="mt-1 text-xs text-slate-500">
                      +{entry.upcomingCount - 1} more scheduled
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <ListChecks className="mr-1 inline h-3.5 w-3.5" />
                    Finished topics ({entry.finishedTopics.length})
                  </p>
                  {entry.finishedTopics.length > 0 ? (
                    <ul className="mt-1.5 space-y-1">
                      {entry.finishedTopics.slice(0, 3).map((t) => (
                        <li key={t.when} className="text-sm text-slate-700">
                          <CircleCheck className="mr-1.5 inline h-3.5 w-3.5 text-emerald-600" />
                          {t.topic}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-sm text-slate-500">
                      None yet — a topic counts when both of you tick the session.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
