import { describe, expect, it } from "vitest";
import { SESSION_GRACE_MS, splitTimetable } from "./timetable";

/**
 * The 15-minute grace window and the "awaiting tick" rule used to live in two
 * copies (the timetable page and the tutor dashboard). They are now pinned
 * here once: a lesson is upcoming until it starts, then it is the tutor's
 * outstanding attendance work until they tick it.
 */
const NOW = Date.parse("2026-10-27T12:00:00Z");

function session(minutesFromNow: number, ticked = false) {
  return {
    scheduled_at: new Date(NOW + minutesFromNow * 60_000).toISOString(),
    tutor_confirmed_at: ticked ? new Date(NOW).toISOString() : null,
  };
}

describe("splitTimetable", () => {
  it("counts a later lesson as upcoming", () => {
    const { upcoming, past, awaitingTick } = splitTimetable([session(120)], NOW);

    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
    expect(awaitingTick).toHaveLength(0);
  });

  it("treats a lesson inside the grace window as awaiting a tick, not upcoming", () => {
    const { upcoming, past, awaitingTick } = splitTimetable([session(10)], NOW);

    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
    expect(awaitingTick).toHaveLength(1);
  });

  it("moves a started lesson to past + awaiting tick", () => {
    const { upcoming, past, awaitingTick } = splitTimetable([session(-10)], NOW);

    expect(upcoming).toHaveLength(0);
    expect(past).toHaveLength(1);
    expect(awaitingTick).toHaveLength(1);
  });

  it("does not ask for a tick on a lesson already ticked", () => {
    const { past, awaitingTick } = splitTimetable([session(-120, true)], NOW);

    expect(past).toHaveLength(1);
    expect(awaitingTick).toHaveLength(0);
  });

  it("keeps the grace window in one place", () => {
    expect(SESSION_GRACE_MS).toBe(15 * 60 * 1000);
    const justPast = splitTimetable(
      [session(-(SESSION_GRACE_MS / 60_000) - 0.02)],
      NOW,
    );
    expect(justPast.awaitingTick).toHaveLength(1);
  });
});
