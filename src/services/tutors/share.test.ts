import { describe, expect, it } from "vitest";
import { courseParamMatches, tutorSharePath } from "./share";

describe("tutorSharePath", () => {
  it("returns the plain profile link without a course", () => {
    expect(tutorSharePath("HC-T-EPBRRC")).toBe("/tutors/HC-T-EPBRRC");
    expect(tutorSharePath("HC-T-EPBRRC", null)).toBe("/tutors/HC-T-EPBRRC");
  });

  it("prefers the readable course code", () => {
    expect(
      tutorSharePath("HC-T-EPBRRC", { id: "uuid-1", code: "ME 255" }),
    ).toBe("/tutors/HC-T-EPBRRC?course=ME%20255");
  });

  it("falls back to the row id for an uncoded course", () => {
    expect(tutorSharePath("HC-T-EPBRRC", { id: "uuid-1", code: null })).toBe(
      "/tutors/HC-T-EPBRRC?course=uuid-1",
    );
    expect(tutorSharePath("HC-T-EPBRRC", { id: "uuid-1", code: "   " })).toBe(
      "/tutors/HC-T-EPBRRC?course=uuid-1",
    );
  });

  it("encodes a code that isn't URL-safe", () => {
    expect(
      tutorSharePath("HC-T-EPBRRC", { id: "uuid-1", code: "ME & IE 255" }),
    ).toBe("/tutors/HC-T-EPBRRC?course=ME%20%26%20IE%20255");
  });
});

describe("courseParamMatches", () => {
  const course = { id: "uuid-1", code: "ME 255" };

  it("matches the row id", () => {
    expect(courseParamMatches(course, "uuid-1")).toBe(true);
  });

  it("matches the code case- and whitespace-insensitively", () => {
    expect(courseParamMatches(course, "ME 255")).toBe(true);
    expect(courseParamMatches(course, "me 255")).toBe(true);
    expect(courseParamMatches(course, "ME   255")).toBe(true);
  });

  it("rejects another course, a blank param and a missing param", () => {
    expect(courseParamMatches(course, "ME 256")).toBe(false);
    expect(courseParamMatches(course, "")).toBe(false);
    expect(courseParamMatches(course, null)).toBe(false);
    expect(courseParamMatches(course, undefined)).toBe(false);
  });

  it("never matches a code against an uncoded course", () => {
    expect(courseParamMatches({ id: "uuid-2", code: null }, "ME 255")).toBe(
      false,
    );
    expect(courseParamMatches({ id: "uuid-2", code: null }, "uuid-2")).toBe(true);
  });
});
