import { cn } from "@/lib/cn";
import {
  accraDayKey,
  isOnDay,
  monthMatrix,
  sessionStartTime,
  type CalendarSession,
} from "@/lib/calendar";

/**
 * Month calendar view — a static current-month grid (server-rendered, zero
 * client JS). Each day cell shows up to 3 session chips; today is outlined;
 * chips are colour-coded by state:
 *   green  → both ticks in (happened, confirmed)
 *   red    → cancelled
 *   brand  → upcoming, awaiting ticks
 */

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MAX_CHIPS = 3;

function chipTone(session: CalendarSession): string {
  if (session.status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700 line-through";
  }
  if (session.tutorConfirmed && session.studentConfirmed) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  return "border-brand-200 bg-brand-50 text-brand-800";
}

export function MonthCalendar({
  sessions,
  now,
  counterpartLabel,
}: {
  sessions: CalendarSession[];
  now: number;
  /** "tutor" | "student" — what to call the other party on a chip. */
  counterpartLabel: "tutor" | "student";
}) {
  const today = new Date(now);
  const matrix = monthMatrix(today.getUTCFullYear(), today.getUTCMonth());
  const todayKey = accraDayKey(now);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {matrix.flat().map((cell) => {
          const cellKey = accraDayKey(cell.getTime());
          const inMonth = cell.getUTCMonth() === today.getUTCMonth();
          const daySessions = sessions.filter((s) => isOnDay(s, cell));
          const isToday = cellKey === todayKey;
          const visible = daySessions.slice(0, MAX_CHIPS);
          const hidden = daySessions.length - visible.length;

          return (
            <div
              key={cellKey}
              className={cn(
                "min-h-[92px] border-b border-r border-slate-100 px-1.5 py-1.5 last:border-r-0",
                !inMonth && "bg-slate-50/60",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                  isToday
                    ? "bg-slate-900 text-white"
                    : inMonth
                      ? "text-slate-700"
                      : "text-slate-300",
                )}
              >
                {cell.getUTCDate()}
              </span>

              <div className="mt-1 space-y-1">
                {visible.map((s) => (
                  <div
                    key={s.id}
                    title={`${sessionStartTime(s.start)} · ${s.counterpartName || counterpartLabel}${s.topic ? ` · ${s.topic}` : ""}`}
                    className={cn(
                      "truncate rounded border px-1.5 py-0.5 text-[10px] font-medium leading-4",
                      chipTone(s),
                    )}
                  >
                    {sessionStartTime(s.start)} {s.counterpartName || counterpartLabel}
                  </div>
                ))}
                {hidden > 0 && (
                  <p className="text-[10px] font-medium text-slate-400">+{hidden} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
