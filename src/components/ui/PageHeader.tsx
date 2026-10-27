import { cn } from "@/lib/cn";

/**
 * The app's one page header.
 *
 * Every role surface hand-wrote the same three lines — a small uppercase
 * kicker, the title, a description — which is how the app ended up with five
 * near-identical headers that had already drifted apart. The kicker is gone:
 * on a working surface the title already says where you are, and the
 * description carries the rest.
 *
 * `actions` holds the one thing that belongs on the right of the header (a
 * code, a switch, a primary action); it wraps under the title on narrow
 * screens instead of squeezing it.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        {/* 24px on phones: a 30px display line plus a long first name wraps
            awkwardly at 320px, and the dashboard's greeting is the first thing
            a student sees. */}
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
