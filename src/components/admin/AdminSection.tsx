/**
 * One heading style for every section of the admin console. Each tab used to
 * pick its own (kicker + 2xl title on Payments, xl on Attendance, lg on
 * Courses, mt-10 here and mt-16 there), which is most of why the console read
 * as messy. Title, optional description, optional right-hand badges/actions.
 */
export function AdminSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The console's one empty state. */
export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}
