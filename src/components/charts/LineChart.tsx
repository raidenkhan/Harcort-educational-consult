"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type LineSeries = {
  name: string;
  /** A validated chart colour (see CHART_COLORS). */
  color: string;
  values: number[];
};

/**
 * Chart colours, validated with the dataviz palette checker against the white
 * card surface (lightness band, chroma, colour-blind separation, contrast):
 * brand-500 + orange pass every check as a pair (CVD ΔE 30). brand-600, the
 * main brand purple, is too dark for a mark (L 0.39) and fails the band.
 */
export const CHART_COLORS = {
  primary: "#9646c6",
  secondary: "#eb6834",
} as const;

const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28 };

/** Clean axis ticks: 0 and 3–5 round steps up to (at least) the max. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ??
    10 * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.0001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** "9 Nov" from "2026-11-09" — UTC is Accra time (GMT, no DST). */
function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * A small dependency-free SVG line chart following the dataviz rules: 2px
 * lines, a 10% wash under a single series, hairline grid, one y axis, a
 * crosshair that snaps to the nearest day with a tooltip listing every
 * series, a legend + direct end labels for 2+ series, and a table view.
 */
export function LineChart({
  days,
  series,
  formatValue,
  formatAxis = formatValue,
  label,
}: {
  days: string[];
  series: LineSeries[];
  formatValue: (n: number) => string;
  formatAxis?: (n: number) => string;
  /** Accessible name for the chart. */
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const multi = series.length > 1;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const ticks = useMemo(() => niceTicks(max), [max]);
  // The left gutter fits the widest tick label (≈6.6px per 11px glyph), so a
  // "GH₵2,500" axis is never clipped the way a fixed gutter clipped it.
  const left = Math.max(
    32,
    Math.ceil(Math.max(...ticks.map((t) => formatAxis(t).length)) * 6.6) + 14,
  );
  // Room on the right for direct end labels when there are several series.
  const right = multi ? 72 : PAD.right;
  const plotW = width - left - right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const top = ticks[ticks.length - 1] || 1;
  const n = days.length;

  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  const xLabelIdx = useMemo(() => {
    if (n <= 1) return [0];
    const count = Math.min(n, Math.max(2, Math.floor(plotW / 110)));
    return Array.from({ length: count }, (_, k) =>
      Math.round((k / (count - 1)) * (n - 1)),
    );
  }, [n, plotW]);

  const path = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  function onMove(clientX: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const px = clientX - rect.left - left;
    const i = n <= 1 ? 0 : Math.round((px / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  }

  const tipLeft = hover === null ? 0 : Math.min(Math.max(x(hover) - 80, 0), width - 160);

  return (
    <div>
      {multi && (
        <ul className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </li>
          ))}
        </ul>
      )}

      <div
        ref={wrapRef}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={label}
          className="block max-w-full"
        >
          {/* Hairline grid + y ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-slate-200)"
                strokeWidth={1}
              />
              <text
                x={left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-slate-500 text-[11px] tabular-nums"
              >
                {formatAxis(t)}
              </text>
            </g>
          ))}

          {/* X labels */}
          {xLabelIdx.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              className="fill-slate-500 text-[11px]"
            >
              {days[i] ? shortDay(days[i]) : ""}
            </text>
          ))}

          {/* Single series: a 10% wash under the line */}
          {!multi && series[0] && n > 1 && (
            <path
              d={`${path(series[0].values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`}
              fill={series[0].color}
              opacity={0.1}
            />
          )}

          {series.map((s) => (
            <path
              key={s.name}
              d={path(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* End dots (+ direct labels when there are several series) */}
          {series.map((s) => {
            const last = s.values[n - 1] ?? 0;
            return (
              <g key={`${s.name}-end`}>
                <circle cx={x(n - 1)} cy={y(last)} r={4} fill={s.color} stroke="white" strokeWidth={2} />
                {multi && (
                  <text
                    x={x(n - 1) + 8}
                    y={y(last)}
                    dominantBaseline="middle"
                    className="fill-slate-700 text-[11px] font-medium"
                  >
                    {formatValue(last)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Crosshair */}
          {hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--color-slate-400)"
                strokeWidth={1}
              />
              {series.map((s) => (
                <circle
                  key={s.name}
                  cx={x(hover)}
                  cy={y(s.values[hover] ?? 0)}
                  r={4}
                  fill={s.color}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>

        {hover !== null && days[hover] && (
          <div
            className="pointer-events-none absolute top-0 w-40 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-lift"
            style={{ left: tipLeft }}
          >
            <p className="text-slate-500">{shortDay(days[hover])}</p>
            {series.map((s) => (
              <p key={s.name} className="mt-1 flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-3 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="font-semibold tabular-nums text-slate-900">
                  {formatValue(s.values[hover] ?? 0)}
                </span>
                <span className="text-slate-500">{s.name}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Table view — every value reachable without hovering. */}
      <details className="mt-2 text-xs text-slate-500">
        <summary className="w-fit">Show as table</summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-slate-200">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-1.5 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.name} className="px-3 py-1.5 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums text-slate-700">
              {[...days.keys()].reverse().map((i) => (
                <tr key={days[i]} className="border-t border-slate-100">
                  <td className="px-3 py-1">{shortDay(days[i])}</td>
                  {series.map((s) => (
                    <td key={s.name} className="px-3 py-1 text-right">
                      {formatValue(s.values[i] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
