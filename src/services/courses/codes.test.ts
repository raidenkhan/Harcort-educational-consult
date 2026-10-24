import { describe, expect, it } from "vitest";
import {
  COURSE_CODE_MAX,
  courseKey,
  isValidCourseCode,
  normalizeCourseCode,
} from "./codes";

describe("normalizeCourseCode", () => {
  it("upper-cases and trims", () => {
    expect(normalizeCourseCode("  me 158 ")).toBe("ME 158");
  });

  it("collapses inner whitespace, including tabs", () => {
    expect(normalizeCourseCode("ME\t\t158")).toBe("ME 158");
    expect(normalizeCourseCode("ME   158")).toBe("ME 158");
  });

  it("returns an empty string for non-strings", () => {
    expect(normalizeCourseCode(null)).toBe("");
    expect(normalizeCourseCode(undefined)).toBe("");
    expect(normalizeCourseCode(158)).toBe("");
  });

  it("is idempotent — normalizing twice changes nothing", () => {
    const once = normalizeCourseCode(" ame   496 ");
    expect(normalizeCourseCode(once)).toBe(once);
  });
});

describe("isValidCourseCode", () => {
  it("accepts real KNUST codes", () => {
    for (const code of ["ME 158", "MATH 151", "AME 496", "IE 356", "COE 158"]) {
      expect(isValidCourseCode(code), code).toBe(true);
    }
  });

  it("accepts a code with no space and a trailing letter", () => {
    expect(isValidCourseCode("ME158")).toBe(true);
    expect(isValidCourseCode("MATH 151A")).toBe(true);
  });

  it("accepts joint-course codes", () => {
    expect(isValidCourseCode("ME & IE 255")).toBe(true);
  });

  it("rejects prose — the real failure mode (name typed into the code box)", () => {
    expect(isValidCourseCode("COMPUTER PROGRAMMING")).toBe(false);
    expect(isValidCourseCode("Thermodynamics")).toBe(false);
  });

  it("rejects an empty or over-long code", () => {
    expect(isValidCourseCode("")).toBe(false);
    expect(isValidCourseCode("M".repeat(COURSE_CODE_MAX + 1))).toBe(false);
  });
});

describe("courseKey", () => {
  it("matches codes that differ only in case or spacing", () => {
    expect(courseKey("Mechanical Engineering", "me  158")).toBe(
      courseKey("Mechanical Engineering", "ME 158"),
    );
  });

  it("separates the same code in different programmes", () => {
    expect(courseKey("Mechanical Engineering", "ME 158")).not.toBe(
      courseKey("Industrial Engineering", "ME 158"),
    );
  });
});
