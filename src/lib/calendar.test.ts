import { describe, expect, it } from "vitest";
import {
  accraDayKey,
  daysBetween,
  groupByDay,
  isOnDay,
  monthMatrix,
  weekStrip,
} from "./calendar";

function session(
  id: string,
  startIso: string,
  hourLen = 1,
): {
  id: string;
  start: number;
  end: number;
  topic: string;
  status: string;
  tutorConfirmed: boolean;
  studentConfirmed: boolean;
  counterpartName: string;
} {
  const start = Date.parse(startIso);
  return {
    id,
    start,
    end: start + hourLen * 3_600_000,
    topic: `Topic ${id}`,
    status: "scheduled",
    tutorConfirmed: false,
    studentConfirmed: false,
    counterpartName: "",
  };
}

describe("calendar math", () => {
  it("builds a month matrix whose rows span the month", () => {
    // September 2026 starts on a Tuesday.
    const matrix = monthMatrix(2026, 8);
    const allCells = matrix.flat();
    expect(allCells).toHaveLength(35); // Tue-start month fits in 5 weeks
    expect(allCells[0].getUTCDay()).toBe(0); // grid is Sunday-aligned
    // First cell is the Sunday before Sep 1 2026 — Aug 30.
    expect(allCells[0].getUTCDate()).toBe(30);
    expect(allCells[0].getUTCMonth()).toBe(7);
  });

  it("keeps every cell a UTC-noon instant", () => {
    const cells = monthMatrix(2026, 8).flat();
    for (const cell of cells) {
      expect(cell.getUTCHours()).toBe(12);
      expect(cell.getUTCMinutes()).toBe(0);
    }
  });

  it("week strip starts on Sunday and contains the timestamp's day", () => {
    // Wed 23 Sep 2026 14:00 UTC.
    const ts = Date.parse("2026-09-23T14:00:00Z");
    const strip = weekStrip(ts);
    expect(strip).toHaveLength(7);
    expect(strip[0].getUTCDay()).toBe(0);
    const wed = strip[3];
    expect(accraDayKey(wed.getTime())).toBe("2026-09-23");
  });

  it("groups sessions by Accra day and checks day membership", () => {
    const sessions = [
      session("a", "2026-09-23T10:00:00Z"),
      session("b", "2026-09-23T20:00:00Z"),
      session("c", "2026-09-24T09:00:00Z"),
    ];
    const grouped = groupByDay(sessions);
    expect(grouped.get("2026-09-23")).toHaveLength(2);
    expect(grouped.get("2026-09-24")).toHaveLength(1);
    expect(isOnDay(sessions[1], new Date("2026-09-23T12:00:00Z"))).toBe(true);
    expect(isOnDay(sessions[2], new Date("2026-09-23T12:00:00Z"))).toBe(false);
  });

  it("counts day gaps across two dates", () => {
    expect(
      daysBetween(
        Date.parse("2026-09-24T10:00:00Z"),
        Date.parse("2026-09-23T10:00:00Z"),
      ),
    ).toBe(1);
    expect(
      daysBetween(
        Date.parse("2026-09-23T10:00:00Z"),
        Date.parse("2026-09-23T10:00:00Z"),
      ),
    ).toBe(0);
  });
});
