"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A course's name — linked to its page — with a small info toggle that
 * reveals the one-line description on demand.
 *
 * Why: the browse lists (home band + /courses directory) printed the
 * description under every title, which made each card three lines taller and
 * turned a list of courses into a wall of text. The course name, its code and
 * its credit hours are what a student scans for; the description is the
 * detail they ask for. So it hides behind an icon until they click.
 *
 * Markup notes for anyone reusing this:
 *   - The link stretches over its **positioned** ancestor through an
 *     `::after` pseudo-element, so the whole card stays one click target
 *     while the info button sits on top of it (`relative z-10`). The card
 *     must therefore carry `relative` (and `group` if it wants hover states).
 *   - The panel is in flow, not an absolute popover: the mobile course list
 *     is a horizontal scroller (`overflow-x-auto`), and an absolutely
 *     positioned panel would be clipped by it.
 *   - The panel sits above the stretched link too, so reading the text can
 *     never navigate away by accident.
 */
export function CourseTitle({
  courseId,
  name,
  description,
  className,
  linkClassName,
}: {
  courseId: string;
  name: string;
  description: string | null;
  className?: string;
  linkClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const hasInfo = Boolean(description && description.trim().length > 0);

  return (
    <div className={className}>
      <div className="flex items-start gap-1.5">
        <Link
          href={`/courses/${courseId}`}
          className={cn(
            "font-display text-base font-semibold tracking-[0.01em] text-slate-900 after:absolute after:inset-0 after:content-['']",
            linkClassName,
          )}
        >
          {name}
        </Link>
        {hasInfo && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={
              open ? `Hide details for ${name}` : `Show details for ${name}`
            }
            className="relative z-10 -mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {open ? (
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            ) : (
              <Info aria-hidden="true" className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>
      {open && hasInfo && (
        <p
          id={panelId}
          className="relative z-10 mt-1.5 rounded-[2px] border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-600"
        >
          {description}
        </p>
      )}
    </div>
  );
}
