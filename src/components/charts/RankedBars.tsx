import type { RankedBar } from "@/services/analytics/growth";

/**
 * Ranked horizontal bars — the dataviz form for comparing parts (largest
 * first, one hue, one shared baseline). Bars are capped at 12px thick with a
 * rounded data end; the value sits at the tip in text ink, never the bar
 * colour. Every value is printed, so no tooltip is needed to read it.
 */
export function RankedBars({
  bars,
  color,
  unit,
  empty,
}: {
  bars: RankedBar[];
  color: string;
  /** Singular noun for the value, e.g. "student". */
  unit: string;
  empty: string;
}) {
  if (bars.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500">
        {empty}
      </p>
    );
  }

  const max = Math.max(...bars.map((b) => b.value), 1);

  return (
    <ul className="space-y-3">
      {bars.map((bar) => (
        <li
          key={bar.label}
          aria-label={`${bar.label}: ${bar.value} ${unit}${bar.value === 1 ? "" : "s"}`}
        >
          <p className="truncate text-xs text-slate-600" title={bar.label}>
            {bar.label}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-3 flex-1">
              <span
                className="block h-3 rounded-r-[4px] transition-opacity hover:opacity-80"
                style={{
                  width: `${Math.max(2, (bar.value / max) * 100)}%`,
                  backgroundColor: color,
                }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-900">
              {bar.value}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
