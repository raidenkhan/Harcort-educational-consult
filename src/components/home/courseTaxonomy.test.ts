import { describe, expect, it } from "vitest";
import { FIELD_ORDER, matchCourses, sortFields } from "./courseTaxonomy";

const COURSES = [
  {
    name: "Fluid Mechanics",
    subject: "Mechanical Engineering",
    description: "Fluid statics, dynamics and pipe flow",
  },
  {
    name: "Structural Analysis I",
    subject: "Civil Engineering",
    description: "Beams, frames and influence lines",
  },
  {
    name: "Circuit Theory I",
    subject: "Electrical & Electronic Engineering",
    description: null,
  },
];

describe("matchCourses", () => {
  it("returns nothing for an empty or whitespace-only query", () => {
    expect(matchCourses(COURSES, "")).toEqual([]);
    expect(matchCourses(COURSES, "   ")).toEqual([]);
  });

  it("matches a course by name, case-insensitively", () => {
    expect(matchCourses(COURSES, "fluid")).toHaveLength(1);
    expect(matchCourses(COURSES, "FLUID MECHANICS")[0].name).toBe(
      "Fluid Mechanics",
    );
  });

  it("matches on field name and description too", () => {
    expect(matchCourses(COURSES, "civil")).toHaveLength(1);
    expect(matchCourses(COURSES, "influence lines")).toHaveLength(1);
  });

  it("handles a null description without throwing", () => {
    expect(matchCourses(COURSES, "circuit")).toHaveLength(1);
  });

  it("spans fields and returns nothing for an unmatched query", () => {
    expect(matchCourses(COURSES, "engineering")).toHaveLength(3);
    expect(matchCourses(COURSES, "quantum")).toEqual([]);
  });
});

describe("sortFields", () => {
  it("returns only the subjects present, in curated order", () => {
    expect(
      sortFields([
        "Mathematics",
        "Mechanical Engineering",
        "Computer Engineering",
      ]),
    ).toEqual(["Mechanical Engineering", "Computer Engineering", "Mathematics"]);
  });

  it("appends unknown subjects alphabetically after the curated ones", () => {
    expect(
      sortFields(["Zoology", "Civil Engineering", "Astronomy"]),
    ).toEqual(["Civil Engineering", "Astronomy", "Zoology"]);
  });

  it("does not invent subjects that are not in the input", () => {
    const result = sortFields(["Business"]);
    expect(result).toEqual(["Business"]);
  });

  it("keeps every curated field name in FIELD_ORDER", () => {
    expect(sortFields(FIELD_ORDER)).toEqual(FIELD_ORDER);
  });
});
