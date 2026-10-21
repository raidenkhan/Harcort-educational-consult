"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  coursesForTerm,
  levelLabel,
  levelsInCourses,
  matchCourses,
  sortFields,
} from "@/components/home/courseTaxonomy";
import { FIELD_ICONS } from "@/components/home/CourseCatalog";

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
 *   3. one level's courses for semester 1 or 2 (cards with code + credits)
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
};

export function CourseDirectory({ courses }: { courses: DirectoryCourse[] }) {
  const programs = sortFields([...new Set(courses.map((c) => c.subject))]);

  const [program, setProgram] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [semester, setSemester] = useState<1 | 2>(1);
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
  const termCourses = program
    ? coursesForTerm(programCourses, activeLevel, semester)
    : [];

  function chooseProgram(next: string) {
    setProgram(next);
    setLevel(null);
    setSemester(1);
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
                <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                              Semester 1 &amp; 2 · {list.length}{" "}
                              {list.length === 1 ? "course" : "courses"}
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

          {/* ── 3. Courses for the chosen term ─────────────────────── */}
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
                    {termCourses.length}{" "}
                    {termCourses.length === 1 ? "course" : "courses"} this
                    semester. Open one for its materials, videos and tutors.
                  </p>
                </div>
              </div>

              <div className="mt-4 inline-flex w-full max-w-sm rounded-lg border border-slate-200 bg-slate-100/80 p-1">
                {([1, 2] as const).map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setSemester(term)}
                    aria-pressed={semester === term}
                    className={cn(
                      "flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-150",
                      semester === term
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    Semester {term}
                  </button>
                ))}
              </div>

              {termCourses.length === 0 ? (
                <p className="mt-5 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                  No courses listed for this semester yet.
                </p>
              ) : (
                <ul className="mt-5 space-y-3">
                  {termCourses.map((course) => (
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
 * One course row: code, credits, name, description. The whole row is the
 * link — same destination as before (`/courses/[id]`), so materials, videos
 * and the tutor list stay exactly where they were.
 */
function CourseRow({
  course,
  showProgram = false,
}: {
  course: DirectoryCourse;
  showProgram?: boolean;
}) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="group flex items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        <BookOpen aria-hidden="true" className="h-5 w-5" />
      </span>

      <span className="min-w-0 flex-1">
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
        </span>
        <span className="mt-1 block font-display text-base font-semibold text-slate-900 group-hover:text-brand-700">
          {course.name}
        </span>
        {course.description && (
          <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-slate-600">
            {course.description}
          </span>
        )}
        <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600">
          Materials &amp; tutors
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </span>
    </Link>
  );
}
