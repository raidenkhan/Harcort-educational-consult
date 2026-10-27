"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * LevelRail — the level (study year) selector for the landing page's course
 * band.
 *
 * Why: a KNUST programme carries a level's worth of courses per year, so
 * rendering every level expanded turned the band into a very long scroll
 * (Mechanical alone is ~40 courses across four levels). The rail turns that
 * into a carousel of level chips where exactly ONE level is open at a time —
 * the student scans the levels, opens the one they are actually in, and the
 * band stays short instead of running the page.
 *
 * Behavior:
 *  - Native snap scrolling (touch swipe) at every width, same idiom as the
 *    course list below it; the arrows are a desktop affordance for the same
 *    track and only appear when the track actually overflows.
 *  - The open chip is scrolled back into view when the open level changes, so
 *    a level picked on a phone is still visible after the track re-lays out.
 *  - Reduced motion: instant scrolling instead of smooth.
 *  - The chips are accordion triggers (`aria-expanded` + `aria-controls`), not
 *    tabs: each one opens a panel of course cards, and the open one can be
 *    closed again.
 */

export type LevelChip = {
  /** Stable id for the level ("1" … "4", "all" for the year-less bucket). */
  key: string;
  label: string;
  count: number;
};

export function LevelRail({
  chips,
  openKey,
  onToggle,
  panelId,
  className,
}: {
  chips: LevelChip[];
  /** Key of the open level, or null when every level is closed. */
  openKey: string | null;
  onToggle: (key: string) => void;
  /** Id of the panel the chips control. */
  panelId: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // The chips change with the chosen programme — a string key keeps the
  // effect deps stable (the array identity changes on every render).
  const chipKey = chips.map((chip) => chip.key).join("|");

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  // Track the scroll position so the arrows know when they have run out.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", sync);
    };
  }, [sync, chipKey]);

  // Keep the open chip visible when the open level changes.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !openKey) return;
    const chip = Array.from(el.children).find(
      (child) => child.getAttribute("data-level-key") === openKey,
    );
    if (!chip) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chip.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [openKey, chipKey]);

  const nudge = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({
      left: dir * Math.max(180, el.clientWidth * 0.75),
      behavior: reduce ? "auto" : "smooth",
    });
  };

  const showArrows = edges.left || edges.right;

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Levels
        </p>
        {showArrows && (
          <div className="hidden items-center gap-1.5 sm:flex">
            <button
              type="button"
              onClick={() => nudge(-1)}
              disabled={!edges.left}
              aria-label="Scroll levels left"
              className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => nudge(1)}
              disabled={!edges.right}
              aria-label="Scroll levels right"
              className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-500 transition-colors duration-150 hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        role="group"
        aria-label="Choose a level"
        className="-mx-4 mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
      >
        {chips.map((chip) => {
          const isOpen = chip.key === openKey;
          return (
            <button
              key={chip.key}
              type="button"
              data-level-key={chip.key}
              onClick={() => onToggle(chip.key)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className={cn(
                "inline-flex shrink-0 snap-start items-center gap-2 rounded-[2px] border px-3.5 py-2 text-[13px] font-medium transition-colors duration-150",
                isOpen
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-300/70 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900",
              )}
            >
              {chip.label}
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  isOpen ? "text-white/70" : "text-slate-400",
                )}
              >
                {chip.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
