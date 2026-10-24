import { describe, expect, it } from "vitest";
import {
  ENGINEERING_FIELDS,
  FIELD_ORDER,
  coursesForTerm,
  engineeringCourses,
  groupCoursesByYear,
  groupCoursesForPicker,
  levelLabel,
  levelsInCourses,
  matchCourses,
  sortFields,
  splitBySemester,
} from "./courseTaxonomy";

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

  it("finds a course by its KNUST code (0026)", () => {
    const coded = [{ ...COURSES[0], code: "ME 255" }];
    expect(matchCourses(coded, "me 255")).toHaveLength(1);
    expect(matchCourses(coded, "ME 2")).toHaveLength(1);
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

describe("engineeringCourses", () => {
  it("keeps only the KNUST engineering programmes, in order", () => {
    // Engineering Mathematics / Engineering Sciences are service subjects,
    // not degrees, so they are no longer student-facing programmes (0026).
    const rows = [
      { subject: "Mechanical Engineering" },
      { subject: "English" },
      { subject: "Engineering Mathematics" },
      { subject: "Business" },
      { subject: "Civil Engineering" },
      { subject: "Exam Prep" },
    ];
    expect(engineeringCourses(rows).map((r) => r.subject)).toEqual([
      "Mechanical Engineering",
      "Civil Engineering",
    ]);
  });

  it("keeps every engineering field and drops every wider-catalog one", () => {
    const kept = engineeringCourses(ENGINEERING_FIELDS.map((subject) => ({ subject })));
    expect(kept).toHaveLength(ENGINEERING_FIELDS.length);

    const dropped = [
      "Computer Science",
      "Mathematics",
      "Sciences",
      "English",
      "Engineering Mathematics",
      "Engineering Sciences",
    ];
    expect(engineeringCourses(dropped.map((subject) => ({ subject })))).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------
// Directory helpers: Program → Level → Semester → Course (0026)
// ---------------------------------------------------------------------------

const TERM_COURSES = [
  { id: "1", name: "Mathematics I", year: 1, semester: 1 },
  { id: "2", name: "Engineering Drawing I", year: 1, semester: 1 },
  { id: "3", name: "Mathematics II", year: 1, semester: 2 },
  { id: "4", name: "Strength of Materials I", year: 2, semester: 1 },
  { id: "5", name: "General Lab Safety", year: null, semester: null },
];

describe("levelLabel", () => {
  it("names a KNUST level by its hundreds", () => {
    expect(levelLabel(1)).toBe("Level 100");
    expect(levelLabel(4)).toBe("Level 400");
  });

  it("uses the same vocabulary for course buckets", () => {
    expect(groupCoursesByYear([{ year: 2 }]).map((b) => b.label)).toEqual([
      "Level 200",
    ]);
    expect(groupCoursesByYear([{ year: null }]).map((b) => b.label)).toEqual([
      "All levels",
    ]);
  });
});

describe("levelsInCourses", () => {
  it("returns the distinct levels, ascending", () => {
    expect(levelsInCourses(TERM_COURSES)).toEqual([1, 2]);
  });

  it("ignores year-null courses and is empty when nothing is level-bound", () => {
    expect(levelsInCourses([TERM_COURSES[4]])).toEqual([]);
    expect(levelsInCourses([])).toEqual([]);
  });
});

describe("coursesForTerm", () => {
  it("filters by level and semester", () => {
    const ids = coursesForTerm(TERM_COURSES, 1, 1).map((c) => c.id);
    expect(ids).toEqual(["1", "2", "5"]);
  });

  it("keeps level-independent courses in both semesters", () => {
    expect(coursesForTerm(TERM_COURSES, 2, 1).map((c) => c.id)).toContain("5");
    expect(coursesForTerm(TERM_COURSES, 1, 2).map((c) => c.id)).toContain("5");
  });

  it("treats a null level as the whole programme", () => {
    expect(coursesForTerm(TERM_COURSES, null, 1).map((c) => c.id)).toEqual([
      "1",
      "2",
      "4",
      "5",
    ]);
  });
});

describe("groupCoursesForPicker", () => {
  it("labels buckets by level and semester, in curriculum order", () => {
    expect(groupCoursesForPicker(TERM_COURSES).map((b) => b.label)).toEqual([
      "Level 100 · Semester 1",
      "Level 100 · Semester 2",
      "Level 200 · Semester 1",
      "All levels · Both semesters",
    ]);
  });

  it("keeps every course, in exactly one bucket", () => {
    const buckets = groupCoursesForPicker(TERM_COURSES);
    const ids = buckets.flatMap((b) => b.items.map((c) => c.id));
    expect(ids.sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("omits empty buckets instead of rendering an empty optgroup", () => {
    const onlyLevelTwo = TERM_COURSES.filter((c) => c.year === 2);
    expect(groupCoursesForPicker(onlyLevelTwo)).toHaveLength(1);
    expect(groupCoursesForPicker([])).toEqual([]);
  });

  it("uses a stable key that distinguishes the same semester across levels", () => {
    const keys = groupCoursesForPicker(TERM_COURSES).map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("splitBySemester", () => {
  const LEVEL_ONE = [
    { id: "1", semester: 1, credits: 4 },
    { id: "2", semester: 1, credits: 2 },
    { id: "3", semester: 2, credits: 3 },
    { id: "4", semester: null, credits: 1 },
    { id: "5", credits: null },
  ];

  it("groups the two terms with their own course and credit totals", () => {
    const { groups } = splitBySemester(LEVEL_ONE);
    expect(groups.map((g) => [g.term, g.items.length, g.credits])).toEqual([
      [1, 2, 6],
      [2, 1, 3],
    ]);
  });

  it("lists a no-semester course once, under 'both', never in a term", () => {
    const { groups, both } = splitBySemester(LEVEL_ONE);
    expect(both.map((c) => c.id)).toEqual(["4", "5"]);
    expect(groups.flatMap((g) => g.items.map((c) => c.id))).toEqual([
      "1",
      "2",
      "3",
    ]);
  });

  it("keeps every course exactly once across the three buckets", () => {
    const { groups, both } = splitBySemester(LEVEL_ONE);
    const ids = [...groups.flatMap((g) => g.items.map((c) => c.id)), ...both.map((c) => c.id)];
    expect(ids.sort()).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("reports no semester data for an untagged catalogue", () => {
    expect(splitBySemester([{ semester: null }, {}]).hasSemesterData).toBe(false);
    expect(splitBySemester([]).hasSemesterData).toBe(false);
    expect(splitBySemester(LEVEL_ONE).hasSemesterData).toBe(true);
  });
});
