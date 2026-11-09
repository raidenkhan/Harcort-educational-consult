import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

export type AdminStat = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Tailwind classes for the icon chip, e.g. "bg-brand-50 text-brand-700". */
  tint: string;
  /** Optional: the tab where this number can be acted on. */
  href?: string;
};

/**
 * The admin console's one stat-tile grid. It used to be hand-written three
 * times (Overview, Payments, Students & plans) with slightly different
 * columns and spacing; every number in the console now renders through here.
 */
export function StatGrid({
  title,
  stats,
}: {
  title?: string;
  stats: AdminStat[];
}) {
  return (
    <section className="mt-10 first:mt-0">
      {title && (
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
      )}
      {/* Sized for the narrow content column beside the console sidebar: a
          tile is ~200px wide at 4-up, and "GH₵2,100.12" in the old 24px
          figure overflowed it. Compact padding, a 36px icon chip (hidden on
          phones, where the tile is narrowest) and an 18px figure fit it. */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {stats.map((stat) => {
          const tile = (
            <Card
              padded={false}
              hover={Boolean(stat.href)}
              className="flex h-full items-center gap-3 p-4"
            >
              <span
                className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-md sm:flex ${stat.tint}`}
              >
                <stat.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p
                  className="truncate font-display text-lg font-bold leading-tight text-slate-900"
                  title={String(stat.value)}
                >
                  {stat.value}
                </p>
                <p className="truncate text-xs font-medium text-slate-500">
                  {stat.label}
                </p>
              </div>
            </Card>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="block">
              {tile}
            </Link>
          ) : (
            <div key={stat.label}>{tile}</div>
          );
        })}
      </div>
    </section>
  );
}
