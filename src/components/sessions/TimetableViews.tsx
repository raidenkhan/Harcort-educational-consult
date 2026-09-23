import type { SessionView } from "@/services/sessions/queries";
import type { CalendarSession } from "@/lib/calendar";
import { CalendarTabs } from "./CalendarTabs";
import { MonthCalendar } from "./MonthCalendar";
import { WeekTimeline } from "./WeekTimeline";
import type { ReactNode } from "react";

/**
 * TimetableViews — adapts SessionView[] (snake_case, ISO strings) into the
 * normalized CalendarSession[] the month/week views consume, then hands all
 * three precomputed views (list / month / week) to the client tab switcher.
 *
 * `now` and `counterpartLabel` arrive as props so the component stays pure —
 * module-level snapshot, per the React Compiler purity rule.
 */

function toCalendarSession(s: SessionView): CalendarSession {
  const start = new Date(s.scheduled_at).getTime();
  return {
    id: s.id,
    start,
    end: start + s.duration_minutes * 60_000,
    topic: s.topic,
    status: s.status,
    tutorConfirmed: Boolean(s.tutor_confirmed_at),
    studentConfirmed: Boolean(s.student_confirmed_at),
    counterpartName: s.student_name || s.tutor_name || "",
  };
}

export function TimetableViews({
  sessions,
  now,
  counterpartLabel,
  listView,
}: {
  sessions: SessionView[];
  now: number;
  counterpartLabel: "tutor" | "student";
  /** The existing list rendering (upcoming + past) as a node. */
  listView: ReactNode;
}) {
  const calendar = sessions.map(toCalendarSession);

  return (
    <CalendarTabs
      listView={listView}
      month={
        <MonthCalendar
          sessions={calendar}
          now={now}
          counterpartLabel={counterpartLabel}
        />
      }
      week={
        <WeekTimeline
          sessions={calendar}
          now={now}
          counterpartLabel={counterpartLabel}
        />
      }
    />
  );
}
