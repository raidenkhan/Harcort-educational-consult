import { cn } from "@/lib/cn";
import {
  accraDayKey,
  sessionStartTime,
  weekStrip,
  type CalendarSession,
} from "@/lib/calendar";
import { sessionWhen } from "@/lib/time";

/**
 * Week timeline view — the current week's 7 days as columns, sessions
 * positioned inside a fixed hour band (07:00–22:00 Accra time; Ghana is GMT
 * so Accra wall-clock == UTC wall-clock). Server-rendered, zero client JS.
 * Blocks start before 07:00 or end after 22:00 clamp to the band edges.
 *
 * Sizing: seven day columns plus an hour gutter need room to stay readable,
 * so the track keeps a minimum width and the container scrolls sideways on
 * phones — squeezed columns turn a calendar into a guessing game. A "now" line
 * marks the current time in today's column, and the week range sits above the
 * grid so the horizontal scroll has a frame of reference.
 */

const START_HOUR = 7;
const END_HOUR = 22;
const TRACK_HOURS = END_HOUR - START_HOUR;
const ROW_HEIGHT_PX = 48;
const LABEL_COL = "3.5rem";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const BAND_SPAN_MS = TRACK_HOURS * HOUR_MS;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_NUMBER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  timeZone: "Africa/Accra",
});
const MONTH_SHORT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "Africa/Accra",
});

/** top/height as % of the 07:00–22:00 band for a session on this day. */
function bandPosition(startMs: number, endMs: number, dayStartMs: number) {
  const s = Math.min(Math.max(startMs - dayStartMs, START_HOUR * HOUR_MS), END_HOUR * HOUR_MS);
  const e = Math.min(Math.max(endMs - dayStartMs, START_HOUR * HOUR_MS), END_HOUR * HOUR_MS);
  return {
    top: ((s - START_HOUR * HOUR_MS) / BAND_SPAN_MS) * 100,
    height: Math.max(((e - s) / BAND_SPAN_MS) * 100, 3),
  };
}

export function WeekTimeline({
  sessions,
  now,
  counterpartLabel,
}: {
  sessions: CalendarSession[];
  now: number;
  /** What to call the other party on a block: "tutor" | "student". */
  counterpartLabel: "tutor" | "student";
}) {
  const strip = weekStrip(now);
  const todayKey = accraDayKey(now);
  const weekStart = strip[0].getTime();
  const weekEnd = strip[strip.length - 1].getTime();
  const rangeLabel = `${DAY_NUMBER.format(new Date(weekStart))} – ${DAY_NUMBER.format(new Date(weekEnd))} ${MONTH_SHORT.format(new Date(weekEnd))}`;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-base font-semibold tracking-[0.01em] text-slate-900">
          Week of {rangeLabel}
        </h3>
        <p className="text-xs font-medium text-slate-500">
          {sessions.length} {sessions.length === 1 ? "session" : "sessions"} this
          week
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div className="min-w-[760px]">
          {/* Day headers */}
          <div
            className="grid border-b border-slate-200 bg-slate-50"
            style={{ gridTemplateColumns: `${LABEL_COL} repeat(7, minmax(0, 1fr))` }}
          >
            <div />
            {strip.map((day) => {
              const key = accraDayKey(day.getTime());
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={cn(
                    "px-1 py-2 text-center text-xs font-semibold",
                    isToday ? "bg-slate-900 text-white" : "text-slate-500",
                  )}
                >
                  <span className="uppercase">
                    {WEEKDAY_LABELS[day.getUTCDay()]}
                  </span>{" "}
                  {day.getUTCDate()}
                </div>
              );
            })}
          </div>

          {/* Hour band */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `${LABEL_COL} repeat(7, minmax(0, 1fr))`,
              gridTemplateRows: `${TRACK_HOURS * ROW_HEIGHT_PX}px`,
            }}
          >
            {/* Hour labels */}
            <div className="relative border-r border-slate-100">
              {Array.from({ length: TRACK_HOURS }, (_, i) => {
                const hour = START_HOUR + i;
                return (
                  <span
                    key={hour}
                    className="absolute right-1 -translate-y-1/2 text-[10px] font-medium text-slate-400"
                    style={{ top: `${(i / TRACK_HOURS) * 100}%` }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </span>
                );
              })}
            </div>

            {/* Day tracks — the noon-UTC cell represents one Accra day, so the
                day's epoch range is cell ± 12h. */}
            {strip.map((day) => {
              const dayStartMs = day.getTime() - 12 * HOUR_MS;
              const dayEndMs = dayStartMs + DAY_MS;
              const key = accraDayKey(day.getTime());
              const isToday = key === todayKey;
              const daySessions = sessions.filter((s) => {
                const startMs = s.start;
                return startMs >= dayStartMs && startMs < dayEndMs;
              });

              // Where "now" falls in today's band (only drawn inside the hours).
              const nowInBand =
                isToday && now >= dayStartMs + START_HOUR * HOUR_MS && now <= dayStartMs + END_HOUR * HOUR_MS;
              const nowTop = nowInBand
                ? ((now - dayStartMs - START_HOUR * HOUR_MS) / BAND_SPAN_MS) * 100
                : null;

              return (
                <div
                  key={key}
                  className={cn(
                    "relative border-r border-slate-100 last:border-r-0",
                    isToday && "bg-brand-50/40",
                  )}
                >
                  {/* Hour lines */}
                  {Array.from({ length: TRACK_HOURS }, (_, h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: `${(h / TRACK_HOURS) * 100}%` }}
                    />
                  ))}

                  {/* Current-time marker */}
                  {nowTop !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-400"
                      style={{ top: `${nowTop}%` }}
                    >
                      <span className="absolute -left-1 -top-[3px] h-1.5 w-1.5 rounded-full bg-red-400" />
                    </div>
                  )}

                  {/* Session blocks */}
                  {daySessions.map((s, idx) => {
                    const durationMs = Math.max(s.end - s.start, 15 * 60_000);
                    const { top, height } = bandPosition(s.start, s.start + durationMs, dayStartMs);
                    const done = s.tutorConfirmed && s.studentConfirmed;
                    const cancelled = s.status === "cancelled";

                    const durationMin = Math.max((s.end - s.start) / 60_000, 15);
                    return (
                      <div
                        key={s.id}
                        title={`${s.counterpartName || counterpartLabel}${s.topic ? ` · ${s.topic}` : ""} · ${sessionWhen(new Date(s.start), durationMin)}`}
                        className={cn(
                          "absolute left-1 right-1 overflow-hidden rounded-md border px-1.5 py-1 text-[11px] leading-tight",
                          cancelled
                            ? "border-red-200 bg-red-50 text-red-600 line-through"
                            : done
                              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                              : "border-brand-200 bg-brand-50 text-brand-900",
                        )}
                        style={{
                          top: `${top}%`,
                          height: `${height}%`,
                          minHeight: "28px",
                          zIndex: idx + 1,
                        }}
                      >
                        <p className="truncate font-semibold">
                          <span className="tabular-nums">
                            {sessionStartTime(s.start)}
                          </span>{" "}
                          {s.counterpartName || counterpartLabel}
                        </p>
                        {s.topic && (
                          <p className="truncate text-[10px] opacity-80">{s.topic}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
