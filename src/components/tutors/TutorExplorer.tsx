"use client";

import { useMemo, useState } from "react";
import { Search, GraduationCap, ShieldCheck, SearchX } from "lucide-react";
import type { TutorListing } from "@/services/tutors/queries";
import { ContactTutorButton } from "@/components/tutors/ContactTutorButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/**
 * Browse-and-search for tutors. Runs entirely client-side over the cached
 * approved-tutor list (server passes it down) — instant filtering, no extra
 * requests. Search matches names, bios, qualifications and course names;
 * subject chips narrow by taxonomy.
 */
export function TutorExplorer({
  tutors,
  signedIn,
}: {
  tutors: TutorListing[];
  signedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<string | null>(null);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const tutor of tutors) {
      for (const course of tutor.courses) set.add(course.subject);
    }
    return Array.from(set).sort();
  }, [tutors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tutors.filter((t) => {
      if (subject && !t.courses.some((c) => c.subject === subject)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        t.profile.full_name,
        t.tutorProfile.bio,
        t.tutorProfile.qualifications,
        ...t.courses.map((c) => `${c.subject} ${c.name}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tutors, query, subject]);

  return (
    <div>
      {/* ── Search + subject filters ─────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-slate-200 bg-white/85 p-4 shadow-card backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, subject, course, or qualification…"
            aria-label="Search tutors"
            className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
        </div>
        {subjects.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <SubjectChip active={subject === null} onClick={() => setSubject(null)}>
              All
            </SubjectChip>
            {subjects.map((s) => (
              <SubjectChip
                key={s}
                active={subject === s}
                onClick={() => setSubject(subject === s ? null : s)}
              >
                {s}
              </SubjectChip>
            ))}
          </div>
        )}
      </div>

      {/* ── Result count ─────────────────────────────────────────── */}
      <p className="mt-6 text-sm text-slate-600" aria-live="polite">
        {filtered.length === 0
          ? "No tutors match your search."
          : `${filtered.length} ${filtered.length === 1 ? "tutor" : "tutors"} ${
              query || subject ? "match" : "available"
            }`}
      </p>

      {/* ── Cards ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-16 text-center">
          <SearchX className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Try a different search term or clear the subject filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSubject(null);
            }}
            className="mt-4 text-sm font-semibold text-slate-900 underline-offset-2 transition hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tutor) => (
            <TutorCard key={tutor.tutorProfile.id} tutor={tutor} signedIn={signedIn} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-150 active:scale-[0.97]",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

function TutorCard({
  tutor,
  signedIn,
}: {
  tutor: TutorListing;
  signedIn: boolean;
}) {
  const { tutorProfile: tp, profile, services, courses } = tutor;
  const courseNames = new Map(courses.map((c) => [c.id, c.name]));
  const offerings = services
    .map((s) => ({ name: courseNames.get(s.course_id) ?? null, price: s.price }))
    .filter((o): o is { name: string; price: number } => o.name !== null);

  return (
    <Card hover className="flex flex-col">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
          {(profile.full_name || "T").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">
            {profile.full_name || "Harcourt tutor"}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge tone="green">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </Badge>
            <p className="text-xs text-slate-500">
              {tp.rate_per_hour != null
                ? `GH₵${tp.rate_per_hour.toLocaleString()}/hr`
                : "Rates on request"}
            </p>
          </div>
        </div>
      </div>

      {tp.bio && (
        <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-600">
          {tp.bio}
        </p>
      )}

      {tp.qualifications && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2.5">
          <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
            {tp.qualifications}
          </p>
        </div>
      )}

      {offerings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {offerings.slice(0, 4).map((o, i) => (
            <span
              key={`${o.name}-${i}`}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-xs"
            >
              {o.name}
              <span className="text-brand-700"> · GH₵{o.price.toLocaleString()}</span>
            </span>
          ))}
          {offerings.length > 4 && (
            <Badge>+{offerings.length - 4} more</Badge>
          )}
        </div>
      )}

      <div className="mt-auto pt-6">
        <ContactTutorButton
          tutorProfileId={tp.id}
          signedIn={signedIn}
          className="h-9 w-full rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
        />
      </div>
    </Card>
  );
}
