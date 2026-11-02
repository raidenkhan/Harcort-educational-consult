import { describe, expect, it } from "vitest";
import {
  CODE_ALPHABET,
  groupMatchesCourse,
  groupTitleForCourse,
  newJoinCode,
  normalizeCourseCode,
  sessionBroadcastLine,
} from "./bookingText";

describe("newJoinCode", () => {
  it("uses only the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = newJoinCode();
      expect(code).toHaveLength(6);
      for (const ch of code) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("honours a requested length", () => {
    expect(newJoinCode(8)).toHaveLength(8);
  });
});

describe("normalizeCourseCode", () => {
  it("upper-cases and collapses runs of whitespace", () => {
    expect(normalizeCourseCode("  me   158 ")).toBe("ME 158");
  });
});

describe("groupMatchesCourse", () => {
  const course = { id: "course-a", code: "ME 261" };

  it("matches on the code even when the row ids differ", () => {
    // The catalogue seeds shared courses once per programme — same code,
    // four different rows.
    expect(
      groupMatchesCourse({ courseId: "course-z", courseCode: "ME 261" }, course),
    ).toBe(true);
  });

  it("ignores case and spacing differences in the code", () => {
    expect(
      groupMatchesCourse({ courseId: null, courseCode: " me  261" }, course),
    ).toBe(true);
  });

  it("never matches a coded group against an uncoded course row", () => {
    expect(
      groupMatchesCourse({ courseId: "course-a", courseCode: null }, course),
    ).toBe(false);
  });

  it("never matches an uncoded group against a coded course row", () => {
    expect(
      groupMatchesCourse({ courseId: "course-a", courseCode: null }, {
        id: "course-a",
        code: "ME 261",
      }),
    ).toBe(false);
  });

  it("falls back to the row id when neither side has a code", () => {
    expect(
      groupMatchesCourse({ courseId: "course-a", courseCode: null }, {
        id: "course-a",
        code: null,
      }),
    ).toBe(true);
    expect(
      groupMatchesCourse({ courseId: "course-b", courseCode: null }, {
        id: "course-a",
        code: null,
      }),
    ).toBe(false);
  });

  it("does not match a group with no course at all", () => {
    expect(
      groupMatchesCourse({ courseId: null, courseCode: null }, {
        id: "course-a",
        code: null,
      }),
    ).toBe(false);
  });
});

describe("groupTitleForCourse", () => {
  it("names coded courses by their code", () => {
    expect(groupTitleForCourse({ code: "ME 261", name: "Dynamics" })).toBe(
      "ME 261 Group",
    );
  });

  it("falls back to the course name", () => {
    expect(groupTitleForCourse({ code: null, name: "Fluid Mechanics" })).toBe(
      "Fluid Mechanics group",
    );
  });

  it("always produces a valid 1–80 character name", () => {
    const long = "A".repeat(200);
    const title = groupTitleForCourse({ code: null, name: long });
    expect(title.length).toBeGreaterThanOrEqual(1);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(groupTitleForCourse({ code: null, name: null })).toBe("Study group");
  });
});

describe("sessionBroadcastLine", () => {
  it("leads with the event and includes the topic", () => {
    expect(
      sessionBroadcastLine("scheduled", "Mon 3 Nov, 4:00–5:30 PM", "Thermodynamics"),
    ).toBe("Session scheduled: Mon 3 Nov, 4:00–5:30 PM — Thermodynamics");
  });

  it("works without a topic", () => {
    expect(sessionBroadcastLine("cancelled", "Tue 4 Nov, 2:00 PM", null)).toBe(
      "Session cancelled: Tue 4 Nov, 2:00 PM",
    );
    expect(sessionBroadcastLine("scheduled", "Tue 4 Nov, 2:00 PM", "  ")).toBe(
      "Session scheduled: Tue 4 Nov, 2:00 PM",
    );
  });
});
