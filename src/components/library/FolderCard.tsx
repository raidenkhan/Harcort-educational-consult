import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * A Google-Drive-style folder card: a tab peeking over the top-left of a
 * rounded panel, with a field/term icon. Purely presentational — the whole
 * card is one link, so a course (or a term) opens on click/tap/keyboard.
 *
 * Used by the course page: one folder per term, and the Drive-materials block
 * for the course's own folder. The drill-down reads identically at both
 * levels.
 */
export function FolderCard({
  href,
  title,
  subtitle,
  icon: Icon,
  meta,
  external,
  className,
}: {
  href: string;
  title: string;
  subtitle?: string | null;
  icon: LucideIcon;
  /** Small trailing content on the top row — e.g. a count badge. */
  meta?: React.ReactNode;
  /** Open in a new tab (the href points outside the app, e.g. Google Drive). */
  external?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {/* Folder tab */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 h-3 w-24 rounded-t-lg border border-b-0 border-slate-200 bg-slate-50 transition-colors duration-200 group-hover:border-brand-200 group-hover:bg-brand-50"
      />
      <div className="relative flex min-h-[8.5rem] flex-col rounded-b-xl rounded-tr-xl border border-slate-200 bg-white p-5 shadow-card transition duration-200 group-hover:-translate-y-0.5 group-hover:border-brand-200 group-hover:shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
          {meta}
        </div>
        <h3 className="mt-3 line-clamp-2 font-semibold leading-snug text-slate-900">
          {title}
        </h3>
        {subtitle && (
          <p className="mt-0.5 line-clamp-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            {subtitle}
          </p>
        )}
      </div>
    </>
  );

  const classes = cn("group relative block pt-3", className);

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
      >
        {body}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {body}
    </Link>
  );
}
