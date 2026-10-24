import {
  LIBRARY_PROGRAMS,
  type LibraryFile,
} from "./driveLibrary";
import { normalizeCourseCode } from "@/services/courses/codes";

/**
 * The Drive library, indexed by COURSE CODE.
 *
 * `/courses` and `/library` were two doors into the same thing: the catalogue
 * knew each course's code, credits and tutors; the library knew each course's
 * Drive folder and video playlists. A student had to guess which door held
 * what. This module joins them — the course page asks "is there a folder for
 * ME 255?" and gets the folder, its term, and the year it belongs to.
 *
 * The join key is the course code, normalized exactly like the catalogue does
 * (`normalizeCourseCode`: upper-case, single-spaced), because the Drive folder
 * names and the seeded curriculum were typed by different hands.
 *
 * Pure and server-safe: no database, no React. The tree is static data.
 */

export interface CourseMaterialsEntry {
  /** Normalized code, e.g. "ME 255". */
  code: string;
  /** The Drive folder for this one course. */
  driveUrl: string;
  /** Library display name, e.g. "Strength of Materials I". */
  libraryName: string;
  /** Programme the folder sits under, e.g. "Mechanical Engineering". */
  programName: string;
  /** "Year 2" — the library's word for a level. */
  yearTitle: string;
  /** 200 — the catalogue's word for the same thing. Null if unparseable. */
  level: number | null;
  /** "Semester 1". */
  termTitle: string;
  /** 1 or 2 — the catalogue's term. Null if unparseable. */
  semester: 1 | 2 | null;
  /** The term's tutorial-video playlists. */
  videos: LibraryFile[];
  /** The year folder — covers courses the catalogue has no row for. */
  yearUrl: string;
  /** The term folder, for "everything this semester". */
  termUrl: string;
}

const LEVEL_BY_YEAR: Record<string, number> = {
  "year-1": 100,
  "year-2": 200,
  "year-3": 300,
  "year-4": 400,
};

/** "year-2" → 200. Null for a folder that isn't a level (e.g. "video-links"). */
export function levelFromYearSlug(slug: string): number | null {
  return LEVEL_BY_YEAR[slug] ?? null;
}

/** "sem-2" → 2. */
export function semesterFromTermSlug(slug: string): 1 | 2 | null {
  if (slug === "sem-1") return 1;
  if (slug === "sem-2") return 2;
  return null;
}

/**
 * code → entry. Built once at module load: 67 folders, so the map costs
 * nothing and every course page can look one up synchronously.
 *
 * First occurrence wins. A code filed under two terms (the final-year streams
 * list the same elective in both semesters) resolves to the first, which is
 * the one the library itself lists first.
 */
const BY_CODE: Map<string, CourseMaterialsEntry> = (() => {
  const index = new Map<string, CourseMaterialsEntry>();

  for (const program of LIBRARY_PROGRAMS) {
    for (const year of program.years) {
      for (const term of year.terms) {
        for (const course of term.courses) {
          const code = normalizeCourseCode(course.code);
          if (!code || index.has(code)) continue;

          index.set(code, {
            code,
            driveUrl: course.url,
            libraryName: course.name,
            programName: program.name,
            yearTitle: year.title,
            level: levelFromYearSlug(year.slug),
            termTitle: term.title,
            semester: semesterFromTermSlug(term.slug),
            videos: term.files,
            yearUrl: year.url,
            termUrl: term.url,
          });
        }
      }
    }
  }

  return index;
})();

/**
 * Catalogue code → the code the Drive folder is labelled with, for the places
 * the two sources disagree. The catalogue follows the department's brochure
 * (0033); the Drive was filed by hand.
 *
 *   ME 158 — "Computer Programming for Engineers" in the brochure, filed in
 *            the Drive as ME 168. A student opening ME 158 must still get the
 *            folder.
 */
const DRIVE_CODE_ALIASES: Record<string, string> = {
  "ME 158": "ME 168",
};

/**
 * The Drive folder for a course code, or null when the library has no folder
 * for it (most programmes outside Mechanical).
 *
 * The returned `code` is always the code the CALLER asked for (normalized), so
 * a page for ME 158 never displays the Drive's ME 168 label.
 */
export function findCourseMaterials(
  code: string | null | undefined,
): CourseMaterialsEntry | null {
  const key = normalizeCourseCode(code);
  if (!key) return null;

  const direct = BY_CODE.get(key);
  if (direct) return { ...direct, code: key };

  const alias = DRIVE_CODE_ALIASES[key];
  const aliased = alias ? BY_CODE.get(alias) : undefined;
  return aliased ? { ...aliased, code: key } : null;
}

/** Every course folder the library carries — used by the tests and any future
 *  "materials" count on the directory. */
export function allCourseMaterials(): CourseMaterialsEntry[] {
  return [...BY_CODE.values()];
}
