import type { SessionView } from "./queries";

/**
 * Timetable arithmetic, kept pure and off the render path (React Compiler
 * purity forbids `Date.now()` inside a component). Every surface that splits
 * a tutor's sessions — the Timetable tab and the dashboard's "next lessons" /
 * "awaiting your tick" counts — goes through this one function so the grace
 * window can never drift between them.
 */

/** A session can be ticked from 15 minutes before its start. */
export const SESSION_GRACE_MS = 15 * 60 * 1000;

export interface TimetableSplit<T> {
  /** Still ahead (a lesson inside the grace window has not started yet). */
  upcoming: T[];
  /** Started, in progress, ended, or already ticked. */
  past: T[];
  /** Started (or inside the grace window) with no tutor attendance tick. */
  awaitingTick: T[];
}

export function splitTimetable<
  T extends Pick<SessionView, "scheduled_at" | "tutor_confirmed_at">,
>(sessions: T[], now: number): TimetableSplit<T> {
  const upcoming: T[] = [];
  const past: T[] = [];
  const awaitingTick: T[] = [];

  for (const session of sessions) {
    const startsAt = new Date(session.scheduled_at).getTime();
    if (startsAt > now + SESSION_GRACE_MS) {
      upcoming.push(session);
      continue;
    }

    past.push(session);
    if (!session.tutor_confirmed_at) awaitingTick.push(session);
  }

  return { upcoming, past, awaitingTick };
}
