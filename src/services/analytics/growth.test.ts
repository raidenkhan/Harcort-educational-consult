import { describe, expect, it } from "vitest";
import {
  countByLabel,
  cumulativeByDay,
  dayRange,
  studentsPerCourse,
} from "./growth";

const at = (iso: string) => Date.parse(iso);

describe("dayRange", () => {
  it("lists every Accra day inclusive, oldest first", () => {
    expect(dayRange(at("2026-11-01T10:00:00Z"), at("2026-11-04T09:00:00Z"))).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
  });

  it("includes today even when the start's time of day is later", () => {
    const days = dayRange(at("2026-11-01T23:00:00Z"), at("2026-11-03T01:00:00Z"));
    expect(days[days.length - 1]).toBe("2026-11-03");
    expect(days).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("caps very long histories", () => {
    const days = dayRange(at("2020-01-01T00:00:00Z"), at("2026-11-09T12:00:00Z"), 30);
    expect(days).toHaveLength(30);
    expect(days[29]).toBe("2026-11-09");
  });
});

describe("cumulativeByDay", () => {
  const days = ["2026-11-02", "2026-11-03", "2026-11-04"];

  it("keeps a running total", () => {
    expect(
      cumulativeByDay(
        [
          { day: "2026-11-02", amount: 10 },
          { day: "2026-11-04", amount: 5 },
          { day: "2026-11-04", amount: 1 },
        ],
        days,
      ),
    ).toEqual([10, 10, 16]);
  });

  it("folds earlier history into the opening value", () => {
    expect(
      cumulativeByDay(
        [
          { day: "2026-10-01", amount: 100 },
          { day: "2026-11-03", amount: 20 },
        ],
        days,
      ),
    ).toEqual([100, 120, 120]);
  });

  it("ignores events after the window and handles an empty window", () => {
    expect(cumulativeByDay([{ day: "2026-12-01", amount: 9 }], days)).toEqual([0, 0, 0]);
    expect(cumulativeByDay([{ day: "2026-11-02", amount: 9 }], [])).toEqual([]);
  });
});

describe("studentsPerCourse", () => {
  const row = (over: Partial<Parameters<typeof studentsPerCourse>[0][number]>) => ({
    studentId: "s1",
    status: "active",
    courseCode: "ME 261",
    courseName: "Dynamics",
    ...over,
  });

  it("counts distinct students and merges duplicate course rows by code", () => {
    const bars = studentsPerCourse([
      row({ studentId: "a", courseCode: "ME 261" }),
      row({ studentId: "b", courseCode: "me  261" }),
      row({ studentId: "a", courseCode: "ME 261" }),
    ]);
    expect(bars).toEqual([{ label: "ME 261 · Dynamics", value: 2 }]);
  });

  it("skips cancelled agreements and falls back to the name without a code", () => {
    const bars = studentsPerCourse([
      row({ status: "cancelled" }),
      row({ courseCode: null, courseName: "Thermo" }),
    ]);
    expect(bars).toEqual([{ label: "Thermo", value: 1 }]);
  });

  it("ranks largest first and folds the tail into Other", () => {
    const bars = studentsPerCourse(
      [
        row({ studentId: "a", courseCode: "A 1", courseName: "A" }),
        row({ studentId: "b", courseCode: "A 1", courseName: "A" }),
        row({ studentId: "a", courseCode: "B 1", courseName: "B" }),
        row({ studentId: "a", courseCode: "C 1", courseName: "C" }),
        row({ studentId: "a", courseCode: "D 1", courseName: "D" }),
      ],
      3,
    );
    expect(bars).toEqual([
      { label: "A 1 · A", value: 2 },
      { label: "B 1 · B", value: 1 },
      { label: "Other", value: 2 },
    ]);
  });
});

describe("countByLabel", () => {
  it("counts labels and names blanks", () => {
    expect(countByLabel(["Mech", "Mech", null, " "], 10)).toEqual([
      { label: "Mech", value: 2 },
      { label: "Not set", value: 2 },
    ]);
  });
});
