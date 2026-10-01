"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  GraduationCap,
  Play,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Reveal } from "./Reveal";
import { LESSON_FIELDS, matchCourses, sortFields } from "./courseTaxonomy";

/**
 * CourseCatalog — the landing page's "Browse by course" band.
 *
 * Why: the site is becoming a home for course materials and tutorial videos,
 * so students need to start from their own course rather than scroll one long
 * mixed list. Fields (the `subject` column of `courses` — effectively the
 * faculty/department) are the top level; picking one narrows the page to that
 * field's courses and the free lessons recorded against it.
 *
 * Data comes in as props from the server page (see page.tsx) — this component
 * never queries anything and never imports from a server-only module.
 */

export type CatalogCourse = {
  id: string;
  subject: string;
  name: string;
  description: string | null;
};

export type CatalogLesson = {
  id: string;
  title: string;
  length: string;
  topic: string;
  channel: string;
};

export function CourseCatalog({
  courses,
  lessons,
  className,
}: {
  courses: CatalogCourse[];
  /** The free-lesson library (HarcourtUniversity LESSONS). */
  lessons: CatalogLesson[];
  className?: string;
}) {
  const fields = sortFields(Array.from(new Set(courses.map((c) => c.subject))));

  // `null` means "not chosen yet" — the default resolves to the first field,
  // so the band renders correctly even if data arrives late or empty.
  const [chosen, setChosen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const active = chosen && fields.includes(chosen) ? chosen : fields[0] ?? null;

  if (!active) return null;

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  // Search spans every field — the point is to jump straight to a course
  // without first knowing which field it lives under. A result's field label
  // opens that field's view, so the student lands in context.
  const matches = matchCourses(courses, query);

  const activeCourses = courses.filter((c) => c.subject === active);
  const activeLessons = lessons
    .filter((lesson) => (LESSON_FIELDS[lesson.id] ?? []).includes(active))
    .slice(0, 3);

  return (
    <div className={className}>
      {/* Search — jump straight to a course by name, field or description
          without knowing which field it lives under. Empty input hands the
          view back to the field chips below. */}
      <Reveal>
        <div className="relative max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a course — e.g. Fluid Mechanics"
            aria-label="Search courses by name"
            className="h-11 w-full rounded-[2px] border border-slate-300/70 bg-white pl-9 pr-12 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
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
      </Reveal>

      {/* Field chips — the top level of the taxonomy. */}
      <Reveal className="mt-3">
        <div
          role="group"
          aria-label="Choose a course field"
          className="flex flex-wrap gap-2"
        >
          {fields.map((field) => {
            const isActive = field === active;
            const count = courses.filter((c) => c.subject === field).length;
            return (
              <button
                key={field}
                type="button"
                onClick={() => {
                  setChosen(field);
                  setQuery("");
                }}
                aria-pressed={isActive && !searching}
                className={cn(
                  "inline-flex items-center gap-2 rounded-[2px] border px-3.5 py-2 text-[13px] font-medium transition-colors duration-150",
                  isActive
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300/70 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900",
                )}
              >
                {field}
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    isActive ? "text-white/70" : "text-slate-400",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </Reveal>

      {searching ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-slate-200 pb-3">
            <h3 className="font-display text-lg font-semibold tracking-[0.01em] text-slate-900">
              {matches.length} {matches.length === 1 ? "result" : "results"} for
              &ldquo;{trimmed}&rdquo;
            </h3>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs font-semibold uppercase tracking-widest text-brand-600 transition-colors hover:text-brand-700"
            >
              Clear
            </button>
          </div>

          {matches.length > 0 ? (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {matches.map((course) => (
                <li key={course.id}>
                  {/* The whole card is the course link — the field is shown as
                      a badge, not a nested button (an interactive element
                      inside a link is invalid and swallows the click). */}
                  <Link
                    href={`/courses/${course.id}`}
                    className="group flex h-full flex-col rounded-[2px] border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">
                      {course.subject}
                    </span>
                    <span className="mt-1.5 flex items-start justify-between gap-3 font-display text-base font-semibold tracking-[0.01em] text-slate-900">
                      {course.name}
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
                    </span>
                    {course.description && (
                      <span className="mt-1.5 text-sm leading-relaxed text-slate-600">
                        {course.description}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-[2px] border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-600">
              No course matches &ldquo;{trimmed}&rdquo;. Try a broader term, or
              pick a field above.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12">
        {/* Courses in the selected field. */}
        <div>
          <div className="flex items-baseline justify-between gap-4 border-b border-slate-200 pb-3">
            <h3 className="font-display text-lg font-semibold tracking-[0.01em] text-slate-900">
              {active}
            </h3>
            <span className="text-xs font-medium uppercase tracking-widest text-slate-400">
              {activeCourses.length}{" "}
              {activeCourses.length === 1 ? "course" : "courses"}
            </span>
          </div>

          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {activeCourses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  className="group flex h-full flex-col rounded-[2px] border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span className="flex items-start justify-between gap-3 font-display text-base font-semibold tracking-[0.01em] text-slate-900">
                    {course.name}
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" />
                  </span>
                  {course.description && (
                    <span className="mt-1.5 text-sm leading-relaxed text-slate-600">
                      {course.description}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* A slice of the tutorial library, scoped to the selected field —
            the rest stays in the full library band further up the page. */}
        <aside className="lg:pt-1">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
            Free lessons
          </p>

          {activeLessons.length > 0 ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Watch a real {active.toLowerCase()} problem worked step by step.
              </p>
              <ul className="mt-4 space-y-4">
                {activeLessons.map((lesson) => (
                  <li key={lesson.id}>
                    <a
                      href={`https://www.youtube.com/watch?v=${lesson.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block overflow-hidden rounded-[2px] border border-slate-200 bg-white transition-colors duration-200 hover:border-slate-300"
                    >
                      <span className="relative block aspect-video overflow-hidden bg-petrol-950">
                        <Image
                          src={`https://i.ytimg.com/vi/${lesson.id}/hq720.jpg`}
                          alt=""
                          fill
                          sizes="(max-width: 1024px) 100vw, 20rem"
                          className="object-cover opacity-90 transition duration-300 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.03] group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                        />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-10 w-10 items-center justify-center rounded-[2px] bg-white/95 text-petrol-900 transition duration-200 [transition-timing-function:var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                            <Play
                              className="h-4 w-4 translate-x-[1px]"
                              fill="currentColor"
                            />
                          </span>
                        </span>
                        <span className="absolute bottom-2 right-2 rounded-[2px] bg-petrol-950/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                          {lesson.length}
                        </span>
                      </span>
                      <span className="block p-3">
                        <span className="block text-[11px] font-semibold uppercase tracking-widest text-brand-600">
                          {lesson.topic}
                        </span>
                        <span className="mt-1 block line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                          {lesson.title}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
              <a
                href="#learn"
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
              >
                See the full lesson library
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </>
          ) : (
            <div className="mt-3 rounded-[2px] border border-dashed border-slate-300 bg-slate-50/60 p-5">
              <p className="text-sm leading-relaxed text-slate-600">
                No free {active.toLowerCase()} lessons published yet. You can
                still browse the full lesson library, or get a tutor who has
                taken these courses.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <a
                  href="#learn"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
                >
                  Browse free lessons
                  <ArrowUpRight className="h-4 w-4" />
                </a>
                <Link
                  href="/tutors"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 transition hover:text-brand-600"
                >
                  <GraduationCap className="h-4 w-4" />
                  Find a tutor
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </aside>
        </div>
      )}
    </div>
  );
}
