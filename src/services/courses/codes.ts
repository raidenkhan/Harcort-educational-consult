/**
 * Course-code normalization (0031).
 *
 * A course code is the dedupe key for "is this the course the tutor means?" —
 * `idx_courses_subject_code_ci` is a unique index on `(subject, upper(code))`.
 * Every write path must therefore normalize the SAME way, or "me 158",
 * "ME  158" and "ME 158" become three rows for one course. Pure and
 * unit-tested so the rule lives in one place.
 */

/** Longest code we accept, e.g. "AME 496" is 7; room for "MATH 151A". */
export const COURSE_CODE_MAX = 16;

/**
 * Upper-case, trim, collapse inner runs of whitespace to one space.
 * Returns "" for anything unusable, so callers can treat it as "missing".
 */
export function normalizeCourseCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Codes are stored as "<PREFIX> <NUMBER>" ("ME 158", "MATH 151"). We accept
 *  a little more (an optional trailing letter, an ampersand for joint
 *  courses) but reject prose, which is the real failure mode — a tutor typing
 *  the course NAME into the code box. */
const CODE_SHAPE = /^[A-Z]{2,5}(?: ?& ?[A-Z]{2,5})? ?\d{2,4}[A-Z]?$/;

export function isValidCourseCode(code: string): boolean {
  return code.length > 0 && code.length <= COURSE_CODE_MAX && CODE_SHAPE.test(code);
}

/**
 * A stable grouping key for "the same course in the same programme".
 * Lower-cased so it can be compared against rows read back from the database
 * without re-normalizing them.
 */
export function courseKey(subject: string, code: string | null | undefined): string {
  return `${subject.trim().toLowerCase()}::${normalizeCourseCode(code)}`;
}
