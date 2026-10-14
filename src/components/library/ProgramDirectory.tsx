"use client";

import { useMemo, useState } from "react";
import { GraduationCap, Search } from "lucide-react";
import { FolderCard } from "@/components/library/FolderCard";
import { Badge } from "@/components/ui/Badge";

export type ProgramOption = {
  slug: string;
  name: string;
  courseCount: number;
};

/**
 * Programme picker — the library's first step. A client-side search keeps the
 * full KNUST College of Engineering list scannable on a phone, and programmes
 * without materials yet stay visible but labelled "Soon".
 */
export function ProgramDirectory({ programs }: { programs: ProgramOption[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((program) =>
      program.name.toLowerCase().includes(q),
    );
  }, [programs, query]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Browse by programme
        </h2>
        <span className="text-sm text-slate-500">
          {programs.length} programmes
        </span>
      </div>

      <label className="relative mt-5 block max-w-md">
        <span className="sr-only">Search programmes</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a programme — Computer, Mechanical…"
          className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-card outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-slate-600">
          No programme matches &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((program) => (
            <FolderCard
              key={program.slug}
              href={`/library?program=${program.slug}`}
              title={program.name}
              subtitle={
                program.courseCount > 0
                  ? "Study materials"
                  : "Materials coming soon"
              }
              icon={GraduationCap}
              meta={
                program.courseCount > 0 ? (
                  <Badge tone="brand">
                    {program.courseCount}{" "}
                    {program.courseCount === 1 ? "course" : "courses"}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Soon</Badge>
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
