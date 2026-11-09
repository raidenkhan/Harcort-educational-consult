"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { CHART_COLORS, LineChart } from "@/components/charts/LineChart";
import { RankedBars } from "@/components/charts/RankedBars";
import type { GrowthSnapshot } from "@/services/analytics/queries";
import { cn } from "@/lib/cn";

const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "all", label: "All time", days: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const cedis = (n: number) =>
  `GH₵${n.toLocaleString("en-GH", { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 })}`;
const cedisAxis = (n: number) =>
  n >= 1000 ? `GH₵${(n / 1000).toLocaleString("en-GH", { maximumFractionDigits: 1 })}K` : `GH₵${n}`;
const count = (n: number) => n.toLocaleString("en-GH");

/**
 * The Insights growth section: money accumulated and users registered over
 * time (one range control above both, which scopes both), then the
 * all-time course and programme breakdowns. Series are running totals, so a
 * shorter window still shows the true total, not a count restarting at zero.
 */
export function GrowthCharts({ growth }: { growth: GrowthSnapshot }) {
  const [range, setRange] = useState<RangeKey>("30");
  const window = RANGES.find((r) => r.key === range)?.days ?? Infinity;
  const start = Number.isFinite(window) ? Math.max(0, growth.days.length - window) : 0;
  const slice = <T,>(values: T[]) => values.slice(start);
  const days = slice(growth.days);

  const latest = (values: number[]) => values[values.length - 1] ?? 0;
  const gained = (values: number[]) => latest(values) - (values[start - 1] ?? 0);

  return (
    <section aria-label="Growth">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            Growth
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Money and people accumulating over time. The range applies to both
            line charts; the course and programme breakdowns are all-time.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Date range"
          className="flex rounded-lg border border-slate-200 bg-white p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="radio"
              aria-checked={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range === r.key
                  ? "bg-petrol-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Money collected</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Running total of verified payments ·{" "}
            <span className="font-semibold text-slate-900">{cedis(latest(growth.collected))}</span>{" "}
            all time, +{cedis(gained(growth.collected))} in this range
          </p>
          <div className="mt-4">
            <LineChart
              label="Running total of money collected"
              days={days}
              series={[
                { name: "Collected", color: CHART_COLORS.primary, values: slice(growth.collected) },
              ]}
              formatValue={cedis}
              formatAxis={cedisAxis}
            />
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Registered users</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Running total by role · +{count(gained(growth.students))} students, +
            {count(gained(growth.tutors))} tutors in this range
          </p>
          <div className="mt-4">
            <LineChart
              label="Running total of registered students and tutors"
              days={days}
              series={[
                { name: "Students", color: CHART_COLORS.primary, values: slice(growth.students) },
                { name: "Tutors", color: CHART_COLORS.secondary, values: slice(growth.tutors) },
              ]}
              formatValue={count}
            />
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Students per course</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Distinct students with a live agreement · top courses
          </p>
          <div className="mt-4">
            <RankedBars
              bars={growth.courses}
              color={CHART_COLORS.primary}
              unit="student"
              empty="No course bookings yet."
            />
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-slate-900">Students by programme</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            The programme each student picked · all registered students
          </p>
          <div className="mt-4">
            <RankedBars
              bars={growth.programmes}
              color={CHART_COLORS.primary}
              unit="student"
              empty="No students yet."
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
