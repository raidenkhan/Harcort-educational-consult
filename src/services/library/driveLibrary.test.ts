import { describe, expect, it } from "vitest";
import { LIBRARY_PROGRAMS } from "./driveLibrary";

/**
 * The official KNUST BSc Mechanical Engineering course structure, fetched from
 * https://mech.knust.edu.gh/ug/bsc-mechanical-engineering (Oct 2026).
 *
 * Courses the outline lists but the library has no folder for yet are left
 * out (ME 487, ME 499, MSE 451…), and folders whose code the outline doesn't
 * carry at all (ME 168, CENG 291, ME 456, ME 462, ME 495, ME 496) are covered
 * by the code-parity rule below instead. Update this snapshot when the
 * department revises the programme.
 *
 * A code may appear under two terms: the final-year streams list the same
 * elective in both semesters.
 */
const OFFICIAL_TERMS: Record<string, string[]> = {
  "year-1/sem-1": ["MATH 151", "ENGL 157", "EE 151", "CE 155", "ME 159", "ME 195", "ME 157"],
  "year-1/sem-2": ["MATH 152", "ENGL 158", "EE 152", "ME 160", "ME 164", "ME 174"],
  "year-2/sem-1": ["MATH 251", "ENGL 263", "ME 261", "ME 251", "ME 281", "ME 255", "ME 259", "ME 295"],
  "year-2/sem-2": ["MATH 252", "ENGL 264", "ME 270", "ME 262", "ME 252", "ME 266", "ME 274", "ME 296"],
  "year-3/sem-1": ["MATH 353", "MATH 351", "ME 363", "ME 365", "ME 395", "ME 373", "ME 361", "ECON 151"],
  "year-3/sem-2": ["ME 356", "ME 392", "ME 374", "ME 352", "ME 366", "ME 362", "ME 396"],
  "year-4/sem-1": [
    "ME 453", "ME 491", "ME 497", "ME 455", "ME 461", "ME 463", "ME 451",
    "ME 457", "ME 465", "ME 467", "ME 469", "ME 473", "ME 477", "ME 481",
    "ME 483", "ME 485",
  ],
  "year-4/sem-2": [
    "ME 452", "ME 464", "ME 468", "ME 472", "ME 474", "ME 478", "ME 482",
    "ME 486", "ME 492", "ME 494", "ME 498",
  ],
};

const mechanical = LIBRARY_PROGRAMS[0];

/** Every course folder in the tree, with the term it is filed under. */
const placed = mechanical.years.flatMap((year) =>
  year.terms.flatMap((term) =>
    term.courses.map((course) => ({ key: `${year.slug}/${term.slug}`, course })),
  ),
);

/** code → the terms the official outline puts it in. */
const officialTerms = new Map<string, Set<string>>();
for (const [term, codes] of Object.entries(OFFICIAL_TERMS)) {
  for (const code of codes) {
    const terms = officialTerms.get(code) ?? new Set<string>();
    terms.add(term);
    officialTerms.set(code, terms);
  }
}

/** `"ME 370 (year-3/sem-2)"` — readable failure output. */
const where = ({ key, course }: (typeof placed)[number]) => `${course.code} (${key})`;

describe("mechanical engineering library", () => {
  it("leads with Mechanical Engineering, two semesters per year", () => {
    expect(mechanical.name).toBe("Mechanical Engineering");
    for (const year of mechanical.years.slice(0, 4)) {
      expect(year.terms.map((term) => term.slug)).toEqual(["sem-1", "sem-2"]);
    }
  });

  it("files odd course codes in Semester 1 and even codes in Semester 2", () => {
    // KNUST's own rule: "codes ending with odd digits are 1st-semester
    // courses while codes ending with even digits are 2nd-semester courses".
    const misfiled = placed.filter(({ key, course }) => {
      const lastDigit = course.code?.match(/\d$/)?.[0];
      if (!lastDigit) return false;
      return Number(lastDigit) % 2 === 1
        ? !key.endsWith("sem-1")
        : !key.endsWith("sem-2");
    });
    expect(misfiled.map(where)).toEqual([]);
  });

  it("files every course in the term the official outline gives it", () => {
    const misfiled = placed.filter(({ key, course }) => {
      const official = course.code ? officialTerms.get(course.code) : undefined;
      return official ? !official.has(key) : false;
    });
    expect(misfiled.map(where)).toEqual([]);
  });

  it("never lists the same course in two terms", () => {
    const codes = placed.map(({ course }) => course.code);
    expect(codes).toHaveLength(new Set(codes).size);
  });
});
