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
 * Curated field order — the KNUST engineering faculties first (the audience
 * the site targets), then the wider academic catalog. Any subject in the
 * database that is not listed here is appended alphabetically by
 * `sortFields`, so new taxonomy rows never silently disappear from the page.
 */
export const FIELD_ORDER = [
  "Mechanical Engineering",
  "Electrical & Electronic Engineering",
  "Computer Engineering",
  "Civil Engineering",
  "Chemical & Petroleum Engineering",
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
  T extends { name: string; subject: string; description: string | null },
>(courses: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return courses.filter((course) =>
    `${course.name} ${course.subject} ${course.description ?? ""}`
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

/** "Year 1" … "Year 4"; null reads "All years". */
export function yearLabel(year: number | null | undefined): string {
  return year ? `Year ${year}` : "All years";
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
