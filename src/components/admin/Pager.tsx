"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Client-side paging for admin lists (People directory, Tutors). The list is
 * already on the page; this only decides which slice to render, so the page
 * stays a reasonable length as users grow.
 *
 * Pass `resetKey` (e.g. the active filter + search): when it changes the view
 * jumps back to page 1, so a new search never opens on an empty page 7.
 */
export function usePagination<T>(items: T[], pageSize = 10, resetKey = "") {
  const [state, setState] = useState({ page: 1, key: resetKey });
  // Reset during render when the filter changes (no effect, no flash).
  const current = state.key === resetKey ? state.page : 1;
  if (state.key !== resetKey) setState({ page: 1, key: resetKey });

  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(current, pages);
  const start = (page - 1) * pageSize;
  return {
    page,
    pages,
    total: items.length,
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
    slice: items.slice(start, start + pageSize),
    setPage: (next: number) =>
      setState({ page: Math.min(Math.max(1, next), pages), key: resetKey }),
  };
}

/** "Showing 11–20 of 57" with Previous / Next. Renders nothing for one page. */
export function Pager({
  page,
  pages,
  from,
  to,
  total,
  onPage,
  noun = "people",
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
  noun?: string;
}) {
  if (pages <= 1) return null;
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"
    >
      <span>
        Showing {from}–{to} of {total} {noun}
      </span>
      <span className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> Previous
        </button>
        <span className="tabular-nums" aria-current="page">
          Page {page} of {pages}
        </span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
    </nav>
  );
}
