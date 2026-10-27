"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  FolderOpen,
  GraduationCap,
  Search,
  X,
} from "lucide-react";
import {
  levelLabel,
  levelsInCourses,
  matchCourses,
  sortFields,
  splitBySemester,
} from "@/components/home/courseTaxonomy";
import { FIELD_ICONS } from "@/components/home/CourseCatalog";
import { CourseTitle } from "./CourseTitle";

/**
 * The /courses directory — program → level → semester → course.
 *
 * This is the shape students already think in at KNUST: you know your
 * programme, then your level, then which semester you're in, and only then do
 * you want a course. The old catalog showed one long field-filtered list,
 * which hid the level/semester structure entirely.
 *
 * Three states, each one level deep, with a breadcrumb back — no modals, no
 * nested dropdowns:
 *   1. all programmes (cards)
 *   2. one programme's levels (rows, with course + credit counts)
 *   3. one level's courses, BOTH semesters shown as headed, counted sections
 *      (cards with code + credits)
 *
 * Semester 3 shows the two terms stacked rather than behind a toggle: a
 * first-year who does not yet know which courses belong to which term needs to
 * see the split, not discover it by clicking. Courses with no semester (or
 * programmes with no semester data at all) fall back to one plain list.
 *
 * A programme with no year tier skips straight to its course list, and
 * courses that aren't level-bound appear at every level. Search stays global:
 * typing finds a course across all programmes by name, code or description.
 */

export type DirectoryCourse = {
  id: string;
  subject: string;
  name: string;
  description: string | null;
  year: number | null;
  code?: string | null;
  credits?: number | null;
  semester?: number | null;
  /** A study-materials folder exists for this code. Resolved on the
   *  server so the client never bundles the whole Drive tree. */
  hasDriveMaterials?: boolean;
};

export function CourseDirectory({ courses }: { courses: DirectoryCourse[] }) {
  const programs = sortFields([...new Set(courses.map((c) => c.subject))]);

  const [program, setProgram] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  const matches = searching ? matchCourses(courses, trimmed) : [];

  const programCourses = program
    ? courses.filter((course) => course.subject === program)
    : [];
  const levels = levelsInCourses(programCourses);
  const activeLevel =
    level !== null && levels.includes(level) ? level : levels.length === 1 ? levels[0] : null;

  // Everything at the chosen level — including courses with no year, which run
  // at every level. Split into the two terms below.
  const levelCourses = program
    ? programCourses.filter(
        (course) =>
          activeLevel === null ||
          course.year === activeLevel ||
          course.year == null,
      )
    : [];
  const semesterGroups = splitBySemester(levelCourses);
  const bothTermCourses = semesterGroups.both;
  const hasSemesterData = semesterGroups.hasSemesterData;

  function chooseProgram(next: string) {
    setProgram(next);
    setLevel(null);
    setQuery("");
  }

  // Read straight off the module-level map (the same pattern as CourseCatalog)
  // so a component is never created during render.
  const ProgramIcon = program ? (FIELD_ICONS[program] ?? GraduationCap) : GraduationCap;

  return (
    <div>
      {/* Search — global, so a student who already knows the code ("ME 255")
          never has to walk the three steps. */}
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a course or code — e.g. ME 255"
          aria-label="Search courses by name or code"
          className="h-11 w-full rounded-lg border border-slate-300/70 bg-white pl-9 pr-12 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {searching ? (
        <section className="mt-8" aria-label="Search results">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-3">
            <h2 className="font-display text-lg font-semibold text-slate-900">
              {matches.length} {matches.length === 1 ? "course" : "courses"} for
              &ldquo;{trimmed}&rdquo;
            </h2>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs font-semibold text-slate-500 transition-colors hover:text-slate-900"
            >
              Clear search
            </button>
          </div>
          {matches.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {matches.map((course) => (
                <li key={course.id}>
                  <CourseRow course={course} showProgram />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-600">
              Nothing matches &ldquo;{trimmed}&rdquo;. Try the course code (e.g.
              ME 255) or a shorter phrase.
            </p>
          )}
        </section>
      ) : (
        <>
          {/* ── Breadcrumb ─────────────────────────────────────────── */}
          {program && (
            <nav aria-label="Directory path" className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setProgram(null);
                  setLevel(null);
                }}
                className="inline-flex items-center gap-1.5 font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All programmes
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              {activeLevel !== null ? (
                <>
                  <button
                    type="button"
                    onClick={() => setLevel(null)}
                    className="font-medium text-slate-600 transition-colors hover:text-slate-900"
                  >
                    {program}
                  </button>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  <span className="font-semibold text-slate-900">
                    {levelLabel(activeLevel)}
                  </span>
                </>
              ) : (
                <span className="font-semibold text-slate-900">{program}</span>
              )}
            </nav>
          )}

          {/* ── 1. Programmes ──────────────────────────────────────── */}
          {!program && (
            <section className="mt-6" aria-label="Programmes">
              <h2 className="font-display text-xl font-bold tracking-[-0.01em] text-slate-900">
                Choose your programme
              </h2>
              <p className="mt-1 max-w-xl text-sm text-slate-600">
                KNUST engineering programmes first. Pick yours, then your level
                and semester — each course carries its code, credits, materials
                and the tutors who teach it.
              </p>

              {programs.length === 0 ? (
                <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No programmes are published yet — check back soon.
                </p>
              ) : (
                <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {programs.map((name) => {
                    const Icon = FIELD_ICONS[name] ?? GraduationCap;
                    const list = courses.filter((c) => c.subject === name);
                    const programmeLevels = levelsInCourses(list);
                    return (
                      <li key={name}>
                        <button
                          type="button"
                          onClick={() => chooseProgram(name)}
                          className="group flex h-full w-full items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                            <Icon aria-hidden="true" className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-base font-semibold text-slate-900 group-hover:text-brand-700">
                              {name}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                              {programmeLevels.length > 0
                                ? `${levelLabel(programmeLevels[0])} – ${levelLabel(programmeLevels[programmeLevels.length - 1])}`
                                : "Courses open"}
                              {" · "}
                              {list.length} {list.length === 1 ? "course" : "courses"}
                            </span>
                          </span>
                          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600 motion-reduce:transition-none" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* ── 2. Levels ──────────────────────────────────────────── */}
          {program && levels.length > 0 && activeLevel === null && (
            <section className="mt-8" aria-label="Levels">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-petrol-900 text-white">
                  <ProgramIcon aria-hidden="true" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-bold tracking-[-0.01em] text-slate-900">
                    {program}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {programCourses.length} courses · choose your level
                  </p>
                </div>
              </div>

              <ul className="mt-5 space-y-3">
                {levels.map((year) => {
                  const list = programCourses.filter((c) => c.year === year);
                  const credits = list.reduce((sum, c) => sum + (c.credits ?? 0), 0);
                  const firstTerm = list.filter((c) => c.semester === 1).length;
                  const secondTerm = list.filter((c) => c.semester === 2).length;
                  const bothTerms = list.filter((c) => c.semester == null).length;
                  return (
                    <li key={year}>
                      <button
                        type="button"
                        onClick={() => setLevel(year)}
                        className="group flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 text-left transition duration-200 hover:border-slate-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        <span className="flex min-w-0 items-center gap-4">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-100 font-mono text-sm font-bold text-slate-700">
                            {year * 100}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-display text-base font-semibold text-slate-900 group-hover:text-brand-700">
                              {levelLabel(year)}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {firstTerm + secondTerm > 0
                                ? `Semester 1: ${firstTerm} · Semester 2: ${secondTerm}${
                                    bothTerms > 0 ? ` · ${bothTerms} both` : ""
                                  }`
                                : `${list.length} ${
                                    list.length === 1 ? "course" : "courses"
                                  }`}
                              {credits > 0 ? ` · ${credits} credit hours` : ""}
                            </span>
                          </span>
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand-600 motion-reduce:transition-none" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ── 3. Courses at the chosen level, split by semester ──── */}
          {program && (levels.length === 0 || activeLevel !== null) && (
            <section className="mt-8" aria-label="Courses">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold tracking-[-0.01em] text-slate-900">
                    {activeLevel !== null
                      ? `${levelLabel(activeLevel)} courses`
                      : `${program} courses`}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {levelCourses.length}{" "}
                    {levelCourses.length === 1 ? "course" : "courses"}
                    {hasSemesterData ? ", grouped by semester" : ""}. Open one for
                    its materials, videos and tutors.
                  </p>
                </div>
              </div>

              {levelCourses.length === 0 ? (
                <p className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No courses listed for this level yet.
                </p>
              ) : hasSemesterData ? (
                <div className="mt-5 space-y-8">
                  {semesterGroups.groups.map(({ term, items, credits }) => (
                    <div key={term}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          Semester {term}
                        </h3>
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                          {items.length}{" "}
                          {items.length === 1 ? "course" : "courses"}
                          {credits > 0 && ` · ${credits} credit hours`}
                        </span>
                      </div>
                      {items.length > 0 ? (
                        <ul className="mt-3 space-y-3">
                          {items.map((course) => (
                            <li key={course.id}>
                              <CourseRow course={course} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                          No courses listed for Semester {term}.
                        </p>
                      )}
                    </div>
                  ))}

                  {bothTermCourses.length > 0 && (
                    <div>
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-2">
                        <h3 className="font-display text-base font-semibold text-slate-900">
                          Runs in both semesters
                        </h3>
                        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                          {bothTermCourses.length}{" "}
                          {bothTermCourses.length === 1 ? "course" : "courses"}
                        </span>
                      </div>
                      <ul className="mt-3 space-y-3">
                        {bothTermCourses.map((course) => (
                          <li key={course.id}>
                            <CourseRow course={course} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <ul className="mt-5 space-y-3">
                  {levelCourses.map((course) => (
                    <li key={course.id}>
                      <CourseRow course={course} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One course row: code, level, credits, name — and an info toggle that
 * reveals the description on demand (see CourseTitle). The row stays a single
 * click target through the stretched link, same destination as before
 * (`/courses/[id]`), so materials, videos and the tutor list stay exactly
 * where they were.
 *
 * A course whose code has a Drive folder says so up front, so a
 * student can see which courses already have notes without opening each one.
 */
function CourseRow({
  course,
  showProgram = false,
}: {
  course: DirectoryCourse;
  showProgram?: boolean;
}) {
  return (
    <div className="group relative flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        <BookOpen aria-hidden="true" className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        {showProgram && (
          <span className="block text-[11px] font-semibold uppercase tracking-widest text-brand-600">
            {course.subject}
            {course.year != null && ` · ${levelLabel(course.year)}`}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          {course.code && (
            <span className="rounded-[2px] bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand-800">
              {course.code}
            </span>
          )}
          {course.year != null && (
            <span className="text-[11px] font-medium text-slate-400">
              {levelLabel(course.year)}
            </span>
          )}
          {course.credits != null && (
            <span className="text-[11px] text-slate-400">
              {course.credits} credit hour{course.credits === 1 ? "" : "s"}
            </span>
          )}
          {course.hasDriveMaterials && (
            <span className="inline-flex items-center gap-1 rounded-[2px] bg-petrol-50 px-1.5 py-0.5 text-[11px] font-semibold text-petrol-900">
              <FolderOpen aria-hidden="true" className="h-3 w-3" />
              Drive notes
            </span>
          )}
        </span>
        <CourseTitle
          courseId={course.id}
          name={course.name}
          description={course.description}
          className="mt-1"
          linkClassName="transition-colors duration-200 group-hover:text-brand-700"
        />
        <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600">
          Materials &amp; tutors
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </div>
    </div>
  );
}
