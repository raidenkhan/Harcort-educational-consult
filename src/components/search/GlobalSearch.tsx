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

/**
 * Global ⌘K search — courses and tutors from anywhere. Opens on ⌘K / Ctrl+K
 * (and a `harcourt:open-search` window event fired by the nav's search
 * button), closes on Escape/backdrop, navigates on select. Course → its page,
 * tutor → /tutors prefilled with the query.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("harcourt:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("harcourt:open-search", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setCategory("all");
  };

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const courseHits = courses
      .filter((c) => matchTokens(q, c.name, c.subject, c.description))
      .map((c) => ({ kind: "course" as const, id: c.id, title: c.name, sub: c.subject }));
    const tutorHits = tutors
      .filter((t) => matchTokens(q, t.name, t.bio, t.qualifications, t.courses))
      .map((t) => ({ kind: "tutor" as const, id: t.id, title: t.name, sub: "Tutor" }));
    const all = [...courseHits, ...tutorHits];
    if (category === "courses") return courseHits;
    if (category === "tutors") return tutorHits;
    return all;
  }, [query, category, courses, tutors]);

  const go = (r: { kind: string; id: string; title: string }) => {
    close();
    if (r.kind === "course") router.push(`/courses/${r.id}`);
    else router.push(`/tutors?q=${encodeURIComponent(r.title)}`);
  };

  if (!open) return null;

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

  const cats: { id: Category; label: string }[] = [
    { id: "all", label: "All" },
    { id: "courses", label: "Courses" },
    { id: "tutors", label: "Tutors" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onKeyDown={onKeyDown}
    >
      <div
        className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm"
        onClick={close}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-xl animate-modal-in overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Search courses and tutors…"
            aria-label="Search courses and tutors"
            className="h-12 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Close search"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1.5 border-b border-slate-100 px-4 py-2">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategory(c.id);
                setActive(0);
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

        <div className="max-h-[55vh] overflow-y-auto p-2">
          {query.trim() === "" ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
              Type a course name, subject, or tutor name.
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-500">
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
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition duration-150 active:scale-[0.96]",
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
    </div>
  );
}
