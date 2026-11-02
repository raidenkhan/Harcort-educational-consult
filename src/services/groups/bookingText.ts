import { randomInt } from "node:crypto";

/**
 * Pure helpers for GROUP BOOKING — seating a student who booked group
 * sessions, and writing the line that broadcasts a timetable change into the
 * group feed.
 *
 * Kept free of server/database imports so the rules are unit-testable in the
 * node environment (see `bookingText.test.ts`). Every query lives in
 * `./booking.ts`.
 */

/** Unambiguous alphabet for shared join codes — no I/O/0/1, easy to type. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A fresh join code, e.g. "K7M2QX". */
export function newJoinCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/** Upper-case, single-spaced — the normalisation the catalogue and the
 *  library already use to compare "me 158" with "ME 158". */
export function normalizeCourseCode(code: string): string {
  return code.trim().replace(/\s+/g, " ").toUpperCase();
}

export interface CourseRef {
  id: string;
  code: string | null;
}

export interface GroupCourseRef {
  courseId: string | null;
  courseCode: string | null;
}

/**
 * Does a study group belong to this course?
 *
 * The CODE is the course identity (the catalogue seeds shared courses once
 * PER PROGRAMME, so one real course has several rows — matching on the row id
 * alone means a group attached to one copy never matches a booking made
 * against another). This mirrors 0038's SQL exactly: codes win when both
 * sides have one; the row id only counts when neither side has a code; one
 * coded side and one uncoded side never match.
 */
export function groupMatchesCourse(
  group: GroupCourseRef,
  course: CourseRef,
): boolean {
  if (group.courseCode && course.code) {
    return normalizeCourseCode(group.courseCode) === normalizeCourseCode(course.code);
  }
  if (group.courseCode || course.code) return false;
  return group.courseId !== null && group.courseId === course.id;
}

/** `study_groups_name_len` allows 1–80 characters. */
const GROUP_NAME_MAX = 80;

/**
 * Name for the group the system creates on a student's behalf: the course
 * code is how students already refer to their courses ("ME 261 Group"), with
 * the bare course name as the fallback for un-coded rows.
 */
export function groupTitleForCourse(course: { code: string | null; name: string | null }): string {
  const code = course.code?.trim();
  if (code) return `${code} Group`.slice(0, GROUP_NAME_MAX);
  const name = course.name?.trim();
  if (name) return `${name} group`.slice(0, GROUP_NAME_MAX);
  return "Study group";
}

/**
 * The feed line that broadcasts a timetable change to the whole group.
 * Written as the actor (tutor or student), so the group sees who changed it.
 */
export function sessionBroadcastLine(
  kind: "scheduled" | "cancelled",
  when: string,
  topic: string | null,
): string {
  const head = kind === "scheduled" ? "Session scheduled" : "Session cancelled";
  const trimmedTopic = topic?.trim();
  return trimmedTopic ? `${head}: ${when} — ${trimmedTopic}` : `${head}: ${when}`;
}
