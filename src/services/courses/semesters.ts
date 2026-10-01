/**
 * Semester grouping for the course library (0018).
 *
 * Pure and dependency-free so the grouping rules are unit-tested rather than
 * buried in JSX: the course page and the admin console both bucket through
 * this, so a change to the ordering shows up in one place.
 */

/** A semester value an asset can carry; null = not assigned yet. */
export type Semester = 1 | 2 | null;

export type SemesterBucket<T> = {
  semester: Semester;
  /** Heading rendered above the bucket. */
  label: string;
  items: T[];
};

/**
 * Human label for one semester value. Accepts a raw `number` so callers can
 * pass the DB column straight through; anything outside 1|2 reads as
 * unassigned rather than inventing a term.
 */
export function semesterLabel(semester: number | null): string {
  if (semester === 1) return "Semester 1";
  if (semester === 2) return "Semester 2";
  return "Not assigned";
}

/**
 * Buckets assets into Semester 1, Semester 2, then unassigned — in that
 * order, and only for buckets that actually have content. An empty input
 * returns no buckets at all (never an empty "Not assigned" section).
 *
 * Normalises any out-of-range value to `null` so callers never render a
 * "Semester 3".
 */
export function groupBySemester<T extends { semester: number | null }>(
  items: T[],
): SemesterBucket<T>[] {
  const bucket = (semester: Semester): T[] =>
    items.filter((item) => (normalizeSemester(item.semester) ?? null) === semester);

  const buckets: { semester: Semester; items: T[] }[] = [
    { semester: 1, items: bucket(1) },
    { semester: 2, items: bucket(2) },
    { semester: null, items: bucket(null) },
  ];

  return buckets
    .filter((entry) => entry.items.length > 0)
    .map((entry) => ({
      semester: entry.semester,
      label: semesterLabel(entry.semester),
      items: entry.items,
    }));
}

/** Anything outside 1|2 is treated as unassigned. */
function normalizeSemester(value: number | null): Semester {
  return value === 1 || value === 2 ? value : null;
}

/** True when at least one asset carries a semester — drives whether the
 *  page shows per-semester headings at all (otherwise a flat list is right). */
export function hasSemesterGrouping(
  items: { semester: number | null }[],
): boolean {
  return items.some((item) => normalizeSemester(item.semester) !== null);
}
