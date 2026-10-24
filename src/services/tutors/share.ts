import { normalizeCourseCode } from "@/services/courses/codes";

/**
 * Shareable tutor links — per tutor AND per course.
 *
 * `/tutors/HC-T-…` is the tutor's whole profile. That is the right link for
 * "this is me", but the wrong one for a WhatsApp message about ONE course: the
 * student lands on a page listing every offering and has to work out which one
 * the tutor meant. The same route therefore takes `?course=`, which opens that
 * offering first and pre-selects it in the request dialog.
 *
 * The reference is the course CODE when it has one ("ME 255" — readable in a
 * message, and stable across databases) and the row id otherwise, because the
 * pre-0031 catalogue has uncoded rows. The page accepts either, so a link a
 * tutor saved months ago never rots.
 */
export interface ShareableCourse {
  id: string;
  code: string | null;
}

/** `/tutors/HC-T-…` or `/tutors/HC-T-…?course=ME%20255`. */
export function tutorSharePath(
  publicCode: string,
  course?: ShareableCourse | null,
): string {
  const base = `/tutors/${encodeURIComponent(normalizeTutorCode(publicCode))}`;
  if (!course) return base;
  const ref = course.code?.trim() || course.id;
  return `${base}?course=${encodeURIComponent(ref)}`;
}

/**
 * Normalise a tutor's public code (`HC-T-EPBRRC`).
 *
 * Why this exists: the code reaches the app from places we do not control — a
 * WhatsApp message where the link was lowercased or auto-capitalised, a
 * copied link with a trailing space (`HC-T-EPBRRC%20`), a phone keyboard that
 * inserts a non-breaking space. Postgres compares `public_code` exactly, so
 * every one of those variants used to render the not-found page. The codes are
 * upper-case ASCII with single hyphens, so collapsing to that shape is lossless
 * for a real code and forgiving for a mangled one.
 *
 * A malformed percent-escape (a link truncated mid-encode) must not throw —
 * `decodeURIComponent` would, and the page would 500 instead of showing a
 * friendly "not found". The raw value is used in that case.
 */
export function normalizeTutorCode(value: unknown): string {
  if (typeof value !== "string") return "";
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return decoded.replace(/[\s\u00a0\u200b]+/g, "").trim().toUpperCase();
}

/**
 * Does a `?course=` value name this course? The row id matches exactly; a code
 * matches after normalization, so "me 255" and "ME  255" both land on "ME 255".
 * An empty/absent param matches nothing — the page then behaves exactly as it
 * did before per-course links existed.
 */
export function courseParamMatches(
  course: ShareableCourse,
  param: string | null | undefined,
): boolean {
  if (!param) return false;
  if (course.id === param) return true;
  const wanted = normalizeCourseCode(param);
  return wanted.length > 0 && normalizeCourseCode(course.code) === wanted;
}
