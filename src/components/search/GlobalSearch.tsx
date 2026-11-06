"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, GraduationCap, Search, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** A course/tutor result, flattened by the server loader so this component
 *  stays dependency-free (no service imports in a client module). */
export type CourseHit = {
  id: string;
  subject: string;
  name: string;
  description: string | null;
};

export type TutorHit = {
  id: string;
  name: string;
  bio: string;
  qualifications: string;
  courses: string;
};

type Category = "all" | "courses" | "tutors";

/** Every token of the query must appear in the haystack (better than a bare
 *  substring — "fluid mechanics" matches "Fluid Mechanics" and "mechanical
 *  knust" matches "Mechanical Engineering"). */
function matchTokens(q: string, ...fields: (string | null | undefined)[]) {
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
}

const cats: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "courses", label: "Courses" },
  { id: "tutors", label: "Tutors" },
];

/**
 * Inline nav search — courses and tutors from anywhere. Rendered inside
 * FloatingNav's `search` slot: a search icon that, on click (or ⌘K / Ctrl+K),
 * expands leftwards into a text field with results in a dropdown beneath it.
 * No modal, no backdrop. Escape, the X, or clicking elsewhere collapses it.
 *
 * Geometry: below `sm` the field covers the whole nav pill (there is no room
 * beside the auth buttons on a 320px screen); from `sm` up it grows left from
 * the icon's own spot. The reveal is a clip-path wipe anchored on the icon, so
 * the field appears to slide out of it; `prefers-reduced-motion` drops the
 * transition.
 *
 * Course → its page, tutor → /tutors prefilled with the query.
 */
export function GlobalSearch({
  courses,
  tutors,
}: {
  courses: CourseHit[];
  tutors: TutorHit[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setQuery("");
    setCategory("all");
    setActive(0);
  };

  // ⌘K / Ctrl+K opens from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Click/tap outside collapses it.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setCategory("all");
        setActive(0);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const courseHits = courses
      .filter((c) => matchTokens(q, c.name, c.subject, c.description))
      .map((c) => ({ kind: "course" as const, id: c.id, title: c.name, sub: c.subject }));
    const tutorHits = tutors
      .filter((t) => matchTokens(q, t.name, t.bio, t.qualifications, t.courses))
      .map((t) => ({ kind: "tutor" as const, id: t.id, title: t.name, sub: "Tutor" }));
    if (category === "courses") return courseHits;
    if (category === "tutors") return tutorHits;
    return [...courseHits, ...tutorHits];
  }, [query, category, courses, tutors]);

  const go = (r: { kind: string; id: string; title: string }) => {
    close();
    if (r.kind === "course") router.push(`/courses/${r.id}`);
    else router.push(`/tutors?q=${encodeURIComponent(r.title)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  const showResults = open && query.trim() !== "";

  return (
    // Below `sm` this wrapper is NOT positioned, so the expanded field and
    // dropdown anchor to the nav pill (FloatingNav's <nav> is `relative`).
    <div ref={rootRef} className="h-9 w-9 sm:relative sm:h-10 sm:w-10" onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        aria-expanded={open}
        title="Search (Ctrl+K)"
        tabIndex={open ? -1 : 0}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition duration-150 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.96] sm:h-10 sm:w-10"
      >
        <Search className="h-4 w-4" />
      </button>

      <div
        role="search"
        aria-hidden={!open}
        className={cn(
          // The input's outline is suppressed (`outline-none!` — the global
          // :focus-visible rule is unlayered, so only !important beats it; its
          // offset outline was clipped to two vertical lines here). Focus is
          // shown on the pill's border instead.
          "absolute inset-0 z-10 flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-4 pr-1.5 shadow-sm focus-within:border-brand-400",
          "sm:inset-auto sm:right-0 sm:top-0 sm:h-10 sm:w-[18rem] md:w-[20rem]",
          "transition-[clip-path,visibility] duration-300 ease-out motion-reduce:transition-none",
          open
            ? "visible [clip-path:inset(0_0_0_0_round_9999px)]"
            : "pointer-events-none invisible [clip-path:inset(0_0_0_calc(100%-2.5rem)_round_9999px)]",
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          tabIndex={open ? 0 : -1}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="Search courses and tutors…"
          aria-label="Search courses and tutors"
          aria-controls="global-search-results"
          aria-autocomplete="list"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none! [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="button"
          onClick={close}
          tabIndex={open ? 0 : -1}
          aria-label="Close search"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {showResults && (
        <div
          id="global-search-results"
          className="absolute inset-x-0 top-full z-10 mt-2 animate-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift sm:left-auto sm:right-0 sm:w-[18rem] md:w-[20rem]"
        >
          <div className="flex gap-1.5 border-b border-slate-100 px-3 py-2">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategory(c.id);
                  setActive(0);
                  inputRef.current?.focus();
                }}
                aria-pressed={category === c.id}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition duration-150 active:scale-[0.96]",
                  category === c.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">
                No courses or tutors match “{query.trim()}”.
              </p>
            ) : (
              <ul>
                {results.map((r, i) => (
                  <li key={`${r.kind}-${r.id}`}>
                    <button
                      type="button"
                      onClick={() => go(r)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition duration-150 active:scale-[0.98]",
                        i === active ? "bg-brand-50" : "hover:bg-slate-50",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                          r.kind === "course"
                            ? "bg-petrol-50 text-petrol-900"
                            : "bg-brand-50 text-brand-700",
                        )}
                      >
                        {r.kind === "course" ? (
                          <BookOpen className="h-4 w-4" />
                        ) : (
                          <GraduationCap className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {r.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{r.sub}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
