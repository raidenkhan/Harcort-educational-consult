/**
 * Course-catalog data for the landing page's "Browse by course" band.
 *
 * Deliberately server-safe (no "use client"): the landing page is a server
 * component and reads these helpers/values, then passes plain data down to
 * the client filter component. See testimonialVideos.ts for why shared data
 * must never live inside a client module (a server component importing from
 * a "use client" file gets a reference stub that throws on property access).
 */

/**
 * The KNUST degree programmes the student-facing catalog shows (browse band,
 * directory, nav search, program picker). A program is a degree, not a
 * subject taught inside one. The five programmes of the KNUST Department of
 * Mechanical Engineering lead the list — their curricula are seeded from the
 * department's own published structures (migration 0030):
 *   https://mech.knust.edu.gh/ug/bsc-mechanical-engineering (+ /undergraduate)
 * Aerospace Engineering is listed by the department but has no published
 * structure yet, so it carries no courses and stays out of the DB until a
 * source exists. The other college fields stay for tutors already offering
 * them; "Engineering Mathematics" / "Engineering Sciences" are service
 * subjects — they stay in the DB for tutor offers but are never presented as
 * things a student can "study". Every student-facing read filters through
 * `engineeringCourses`.
 */
export const ENGINEERING_FIELDS: readonly string[] = [
  "Mechanical Engineering",
  "Industrial Engineering",
  "Marine Engineering",
  "Automobile Engineering",
  "Aerospace Engineering",
  "Electrical & Electronic Engineering",
  "Computer Engineering",
  "Civil Engineering",
  "Chemical & Petroleum Engineering",
];

/**
 * Curated field order — the KNUST engineering faculties first (the audience
 * the site targets), then the wider academic catalog. Any subject in the
 * database that is not listed here is appended alphabetically by
 * `sortFields`, so new taxonomy rows never silently disappear from the page.
 */
export const FIELD_ORDER = [
  ...ENGINEERING_FIELDS,
  "Engineering Mathematics",
  "Engineering Sciences",
  "Computer Science",
  "Mathematics",
  "Sciences",
  "Business",
  "English",
  "Languages",
  "Exam Prep",
];

/**
 * Narrows a course list to `ENGINEERING_FIELDS`, preserving order — the
 * engineering-only rule for student-facing surfaces. Pure and typed off the
 * row shape, so any `{ subject }` list (courses, search hits) can pass through.
 */
export function engineeringCourses<T extends { subject: string }>(
  courses: T[],
): T[] {
  return courses.filter((course) =>
    ENGINEERING_FIELDS.includes(course.subject),
  );
}

/**
 * Which course fields each free lesson belongs to, keyed by video id. The
 * lessons themselves live in HarcourtUniversity's LESSONS list; keeping the
 * mapping here means that module stays untouched, and a lesson with no entry
 * simply shows up under no field (it is still in the full library band).
 */
export const LESSON_FIELDS: Record<string, string[]> = {
  // Harcourt University — engineering mechanics, machines, dynamics.
  Y7Ro0SJAsiQ: ["Mechanical Engineering", "Civil Engineering"],
  "9MK_Trj4a24": ["Mechanical Engineering"],
  g6PYU11DrMo: ["Mechanical Engineering"],
  NK7Qhg6F7ZY: ["Mechanical Engineering"],
  // LoganDemia — computer architecture, digital signal processing.
  ewyPOql60BQ: ["Computer Engineering", "Electrical & Electronic Engineering"],
  "v-1D01fE77w": ["Computer Engineering", "Electrical & Electronic Engineering"],
  "Kx6q-F2W_lg": ["Computer Engineering", "Electrical & Electronic Engineering"],
  Yq70B9AvFb8: ["Electrical & Electronic Engineering", "Computer Engineering"],
};

/**
 * Subjects in curated order; unknown subjects are appended alphabetically.
 * Pure — unit-testable and safe to call during render.
 */
/**
 * Courses matching a free-text query, searching name, field and description.
 * An empty (or whitespace-only) query returns no results — the caller decides
 * that an empty query means "no search", not "show everything".
 */
export function matchCourses<
  T extends {
    name: string;
    subject: string;
    description: string | null;
    code?: string | null;
  },
>(courses: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return courses.filter((course) =>
    `${course.name} ${course.subject} ${course.code ?? ""} ${course.description ?? ""}`
      .toLowerCase()
      .includes(needle),
  );
}

export function sortFields(subjects: string[]): string[] {
  const known = FIELD_ORDER.filter((field) => subjects.includes(field));
  const extra = subjects
    .filter((subject) => !FIELD_ORDER.includes(subject))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

/**
 * The year tier (0020). KNUST engineering runs four years; a course or a
 * student is tied to one of these, or null for "not year-specific / any
 * year". Kept here (server-safe, already imported by the catalog + dashboard)
 * so the picker, catalog and admin console share one definition.
 */
export const YEARS = [1, 2, 3, 4] as const;
export type Year = (typeof YEARS)[number];

/** "Level 100" … "Level 400"; null reads "All levels". KNUST names a
 *  study year by its hundreds, so course buckets use the same vocabulary as
 *  the directory. */
export function yearLabel(year: number | null | undefined): string {
  return year ? levelLabel(year) : "All levels";
}

/** "Level 100" — KNUST names a study year by its hundreds. */
export function levelLabel(year: number): string {
  return `Level ${year * 100}`;
}

/**
 * The levels a programme actually has courses for, ascending. Empty when none
 * of its courses carry a year — the directory then skips the level step
 * instead of showing four empty levels.
 */
export function levelsInCourses(
  courses: { year: number | null }[],
): number[] {
  return [...new Set(courses.map((c) => c.year).filter((y): y is number => y != null))]
    .sort((a, b) => a - b);
}

/**
 * Courses for one level + semester (0026). A null `level` means "the whole
 * programme" (no level step). A course with no year is not level-bound, so it
 * appears at every level; a null `semester` runs in both.
 */
export function coursesForTerm<
  T extends { year: number | null; semester?: number | null },
>(courses: T[], level: number | null, semester: 1 | 2): T[] {
  return courses.filter(
    (course) =>
      (level === null || course.year === level || course.year == null) &&
      (course.semester == null || course.semester === semester),
  );
}

/**
 * Buckets courses into Year 1 → 4, then "All years" (year-null) — only for
 * buckets that actually have content, in that order.
 */
export function groupCoursesByYear<T extends { year: number | null }>(
  courses: T[],
): { year: number | null; label: string; items: T[] }[] {
  const buckets: { year: number | null; items: T[] }[] = [
    ...YEARS.map((year) => ({
      year: year as number | null,
      items: courses.filter((c) => c.year === year),
    })),
    { year: null, items: courses.filter((c) => c.year == null) },
  ];
  return buckets
    .filter((b) => b.items.length > 0)
    .map((b) => ({ year: b.year, label: yearLabel(b.year), items: b.items }));
}
