/**
 * Server-safe skeleton matching the /tutors directory layout: the filter
 * panel, result count line, and a three-card grid shell. Pure markup, no
 * data — renders in milliseconds while the real page streams.
 */
export function TutorExplorerSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mt-8 rounded-lg border border-slate-200 bg-white/85 p-4 shadow-card backdrop-blur">
        <div className="h-11 w-full animate-pulse rounded-md bg-slate-100" />
        <div className="mt-3 flex flex-wrap gap-2">
          {["All", "Mechanical Engineering", "Computer Engineering"].map((s) => (
            <span
              key={s}
              className="h-7 animate-pulse rounded-full border border-slate-200 bg-slate-100"
              style={{ width: `${s.length * 7.5 + 24}px` }}
            />
          ))}
        </div>
      </div>

      <p className="mt-6 h-5 w-40 animate-pulse rounded bg-slate-100" />

      <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-card"
          >
            <div className="flex items-center gap-3">
              <span className="h-11 w-11 shrink-0 animate-pulse rounded-md bg-slate-100" />
              <div className="min-w-0 flex-1 space-y-2">
                <span className="block h-4 w-28 animate-pulse rounded bg-slate-100" />
                <span className="block h-3 w-20 animate-pulse rounded bg-slate-100" />
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <span className="block h-3 w-full animate-pulse rounded bg-slate-100" />
              <span className="block h-3 w-4/5 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="mt-4 h-9 w-full animate-pulse rounded-md bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
