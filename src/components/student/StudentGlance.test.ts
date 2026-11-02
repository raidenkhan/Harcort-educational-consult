import { describe, expect, it } from "vitest";
import { pickNextLesson } from "./StudentGlance";
import type { SessionView } from "@/services/sessions/queries";

/** A session on the student's timetable, with only the fields the picker reads. */
function session(
  overrides: Partial<SessionView> & { scheduled_at: string },
): SessionView {
  return {
    id: overrides.id ?? "s-1",
    tutor_profile_id: "tp-1",
    student_id: "p-1",
    scheduled_at: overrides.scheduled_at,
    duration_minutes: overrides.duration_minutes ?? 60,
    topic: overrides.topic ?? null,
    location: null,
    notes: null,
    status: overrides.status ?? "scheduled",
    cancelled_at: null,
    cancelled_by: null,
    tutor_confirmed_at: null,
    student_confirmed_at: null,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    student_name: "Student",
    tutor_name: overrides.tutor_name ?? "Tutor",
  };
}

const HOUR = 3_600_000;
/** ISO strings relative to the real clock (the picker reads Date.now()). */
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

describe("pickNextLesson", () => {
  it("returns null when there is nothing booked", () => {
    expect(pickNextLesson([])).toBeNull();
  });

  it("picks the earliest upcoming session", () => {
    const later = session({ scheduled_at: inHours(30), id: "later" });
    const sooner = session({ scheduled_at: inHours(2), id: "sooner" });
    expect(pickNextLesson([later, sooner])?.id).toBe("sooner");
  });

  it("ignores cancelled sessions", () => {
    expect(
      pickNextLesson([session({ scheduled_at: inHours(1), status: "cancelled" })]),
    ).toBeNull();
  });

  it("ignores sessions whose end time has passed", () => {
    // Started 2h ago, 1h long — long over.
    expect(
      pickNextLesson([session({ scheduled_at: inHours(-2), duration_minutes: 60 })]),
    ).toBeNull();
  });

  it("still shows a session that is in progress but not finished", () => {
    // Started 15 minutes ago, 1h long — the lesson is happening now.
    const running = session({
      scheduled_at: new Date(Date.now() - 15 * 60_000).toISOString(),
      duration_minutes: 60,
    });
    expect(pickNextLesson([running])?.id).toBe(running.id);
  });
});
