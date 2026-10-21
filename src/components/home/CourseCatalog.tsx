"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Atom,
  Briefcase,
  Building2,
  Calculator,
  Code2,
  Cog,
  Cpu,
  FlaskConical,
  GraduationCap,
  Languages,
  Microscope,
  Play,
  Search,
  Sigma,
  Target,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Reveal } from "./Reveal";
import { LevelRail } from "./LevelRail";
import {
  LESSON_FIELDS,
  matchCourses,
  sortFields,
  groupCoursesByYear,
} from "./courseTaxonomy";

/**
 * CourseCatalog — the landing page's "Browse by course" band.
 *
 * Why: the site is becoming a home for course materials and tutorial videos,
 * so students need to start from their own course rather than scroll one long
 * mixed list. Fields (the `subject` column of `courses` — effectively the
 * faculty/department) are the top level; picking one narrows the page to that
 * field's courses and the free lessons recorded against it.
 *
 * The band reads as a program picker first: every field carries its own icon
 * so the four engineering faculties stay visually distinct at a glance, the
 * selected program gets a header, and the courses themselves are the page's
 * hero cards. Within a program the levels live on a rail (see LevelRail) and
 * only one is open at a time, so the band stays a band instead of a very long
 * scroll through every year of the curriculum. Free lessons are demoted to a
 * single strip underneath — the full lesson library already has its own band
 * further up the page.
 *
 * Data comes in as props from the server page (see page.tsx) — this component
 * never queries anything and never imports from a server-only module.
 */

export type CatalogCourse = {
  id: string;
  subject: string;
  name: string;
  description: string | null;
  /** Year tier (0020) — 1–4, null = not year-specific. */
  year: number | null;
  /** KNUST code, credits and semester (0026) — optional so pre-migration
   *  rows still render. */
  code?: string | null;
  credits?: number | null;
  semester?: number | null;
};

export type CatalogLesson = {
  id: string;
  title: string;
  length: string;
  topic: string;
  channel: string;
};

/**
 * Program identity — one icon per field. Unknown subjects (anything a
 * future taxonomy row adds) fall back to the graduation cap, so a new row
 * never renders as a blank chip.
 */
export const FIELD_ICONS: Record<string, LucideIcon> = {
  "Mechanical Engineering": Cog,
  "Electrical & Electronic Engineering": Zap,
  "Computer Engineering": Cpu,
  "Civil Engineering": Building2,
  "Chemical & Petroleum Engineering": FlaskConical,
  "Engineering Mathematics": Sigma,
  "Engineering Sciences": Atom,
  "Computer Science": Code2,
  Mathematics: Calculator,
  Sciences: Microscope,
  Business: Briefcase,
  English: Languages,
  Languages: Languages,
  "Exam Prep": Target,
};

/**
 * Course lists: a horizontal snap-scroll on phones — a program can carry a
 * dozen-plus courses and a single-column stack runs the page forever — then
 * the normal 2/3-column grid from `sm` up. The negative margin bleeds the
 * track to the Container's edges (both call sites sit inside Container's
 * px-6) so the next card peeks past the fold: that peek *is* the scroll
 * affordance, no caption needed. Card height stays even because a flex row
 * stretches its items; at `sm` the grid takes over and `w-auto` re-opens.
 */
const LIST =
  "-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-6 pt-1.5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pt-0 sm:pb-0 lg:grid-cols-3";
const LIST_ITEM = "w-[76%] shrink-0 snap-start sm:w-auto";

/**
 * One course card. The whole card is the link; when `eyebrow` is set the
 * field (and year) rides above the title, since search results span fields.
 */
function CourseCard({
  course,
  eyebrow = false,
}: {
  course: CatalogCourse;
  eyebrow?: boolean;
}) {
  return (
    <Link
      href={`/courses/${course.id}`}
      className="group flex h-full flex-col rounded-[2px] border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {eyebrow && (
        <span className="block truncate text-[11px] font-semibold uppercase tracking-widest text-brand-600">
          {course.subject}
          {course.year != null && ` · Level ${course.year * 100}`}
        </span>
      )}
      {course.code && (
        <span className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="rounded-[2px] bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
            {course.code}
          </span>
          {course.credits != null && (
            <span className="text-[11px] text-slate-400">
              {course.credits} credit hour{course.credits === 1 ? "" : "s"}
            </span>
          )}
        </span>
      )}
      <span className="font-display text-base font-semibold tracking-[0.01em] text-slate-900">
        {course.name}
      </span>
      {course.description && (
        <span className="mt-1.5 text-sm leading-relaxed text-slate-600">
          {course.description}
        </span>
      )}
      <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-brand-600">
        Materials &amp; tutors
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 [transition-timing-function:var(--ease-out)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}

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
  // Which level is open, per programme. `key: null` means the student closed
  // every level; the field is part of the state so switching programme
  // falls back to that programme's first level instead of a stale choice.
  const [levelChoice, setLevelChoice] = useState<{
    field: string;
    key: string | null;
  } | null>(null);
  const active = chosen && fields.includes(chosen) ? chosen : fields[0] ?? null;

  // No courses at all — an empty taxonomy, or a read that degraded to nothing.
  // Show an honest empty state instead of returning null: a null return leaves
  // the band as a bare heading, which reads as "the section is broken".
  if (!active) {
    return (
      <div className={className}>
        <p className="rounded-[2px] border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-600">
          No courses are published right now — check back soon, or{" "}
          <Link
            href="/tutors"
            className="font-semibold text-slate-900 transition hover:text-brand-600"
          >
            browse our tutors
          </Link>{" "}
          directly.
        </p>
      </div>
    );
  }

  const trimmed = query.trim();
  const searching = trimmed.length > 0;
  // Search spans every field — the point is to jump straight to a course
  // without first knowing which field it lives under. A result's field label
  // opens that field's view, so the student lands in context.
  const matches = matchCourses(courses, query);

  const activeCourses = courses.filter((c) => c.subject === active);
  const activeYearBuckets = groupCoursesByYear(activeCourses);
  const activeLessons = lessons.filter((lesson) =>
    (LESSON_FIELDS[lesson.id] ?? []).includes(active),
  );
  const featured = activeLessons[0];
  // Read straight off the module-level map (a component reference, not a
  // call) so react-hooks/static-components can't see a component "created
  // during render".
  const ActiveIcon = FIELD_ICONS[active] ?? GraduationCap;

  // One level open at a time — the rail's chips, and which one is open.
  const levelChips = activeYearBuckets.map((bucket) => ({
    key: bucket.year == null ? "all" : String(bucket.year),
    label: bucket.label,
    count: bucket.items.length,
  }));
  const openLevelKey =
    levelChoice && levelChoice.field === active
      ? levelChoice.key
      : (levelChips[0]?.key ?? null);
  const openBucket =
    activeYearBuckets.find(
      (bucket) => (bucket.year == null ? "all" : String(bucket.year)) === openLevelKey,
    ) ?? null;

  return (
    <div className={className}>
      {/* Search — jump straight to a course by name, field or description
          without knowing which field it lives under. Empty input hands the
          view back to the program picker below. */}
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

      {/* Program picker — the top level of the taxonomy, one icon per
          faculty so the engineering disciplines read as distinct options. */}
      <Reveal className="mt-3">
        <div
          role="group"
          aria-label="Choose your program"
          className="flex flex-wrap gap-2"
        >
          {fields.map((field) => {
            const Icon = FIELD_ICONS[field] ?? GraduationCap;
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
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
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
            <ul className={cn("mt-4", LIST)}>
              {matches.map((course) => (
                <li key={course.id} className={LIST_ITEM}>
                  <CourseCard course={course} eyebrow />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-[2px] border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-600">
              No course matches &ldquo;{trimmed}&rdquo;. Try a broader term, or
              pick a program above.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-8">
          {/* Program header — names the pick and stamps it with its icon. */}
          <div className="flex items-center gap-3.5 border-b border-slate-200 pb-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[2px] bg-petrol-900 text-white">
              <ActiveIcon aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">
                Your program
              </p>
              <h3 className="truncate font-display text-xl font-semibold tracking-[0.01em] text-slate-900">
                {active}
              </h3>
            </div>
            <span className="hidden text-xs font-medium uppercase tracking-widest text-slate-400 sm:block">
              {activeCourses.length}{" "}
              {activeCourses.length === 1 ? "course" : "courses"}
            </span>
          </div>

          {/* Courses in the selected field, one level at a time — the hero of
              this band. The rail keeps the band short: a programme carries a
              level's worth of courses per year, so opening every level at once
              ran the page for a very long scroll. */}
          <LevelRail
            className="mt-6"
            chips={levelChips}
            openKey={openLevelKey}
            panelId="course-level-panel"
            onToggle={(key) =>
              setLevelChoice({
                field: active,
                key: openLevelKey === key ? null : key,
              })
            }
          />

          <div id="course-level-panel" className="mt-5">
            {openBucket ? (
              <ul className={cn(LIST)}>
                {openBucket.items.map((course) => (
                  <li key={course.id} className={LIST_ITEM}>
                    <CourseCard course={course} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-[2px] border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-600">
                Every level is closed. Open one above to see its courses.
              </p>
            )}
          </div>

          {/* Free lessons, demoted to one quiet strip. The full library band
              sits further up the page — this is only a taste of it. */}
          <div className="mt-9 border-t border-slate-200 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Free lessons
              </p>
              <a
                href="#learn"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
              >
                See the full lesson library
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </div>

            {featured ? (
              <a
                href={`https://www.youtube.com/watch?v=${featured.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-3 flex gap-4 rounded-[2px] border border-slate-200 bg-white p-3 transition-colors duration-200 hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:gap-5 sm:p-4"
              >
                <span className="relative block aspect-video w-32 shrink-0 overflow-hidden rounded-[2px] bg-petrol-950 sm:w-48">
                  <Image
                    src={`https://i.ytimg.com/vi/${featured.id}/hqdefault.jpg`}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 8rem, 12rem"
                    className="object-cover opacity-90 transition duration-300 [transition-timing-function:var(--ease-out)] group-hover:scale-[1.03] group-hover:opacity-100 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[2px] bg-white/95 text-petrol-900 transition duration-200 [transition-timing-function:var(--ease-out)] group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                      <Play
                        className="h-3.5 w-3.5 translate-x-[1px]"
                        fill="currentColor"
                      />
                    </span>
                  </span>
                  <span className="absolute bottom-1.5 right-1.5 rounded-[2px] bg-petrol-950/85 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
                    {featured.length}
                  </span>
                </span>
                <span className="flex min-w-0 flex-col justify-center gap-1">
                  <span className="truncate text-[11px] font-semibold uppercase tracking-widest text-brand-600">
                    {featured.topic}
                  </span>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                    {featured.title}
                  </span>
                  <span className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                    Watch a real {active.toLowerCase()} problem worked step by
                    step.
                  </span>
                </span>
              </a>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                No free {active.toLowerCase()} lessons published yet. You can
                still browse the{" "}
                <a
                  href="#learn"
                  className="font-semibold text-brand-600 transition hover:text-brand-700"
                >
                  full lesson library
                </a>
                , or{" "}
                <Link
                  href="/tutors"
                  className="font-semibold text-slate-900 transition hover:text-brand-600"
                >
                  find a tutor
                </Link>{" "}
                who has taken these courses.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
