import { normalizeCourseCode } from "@/services/courses/codes";

/**
 * Pure shaping for the Insights growth charts, keyed by Accra calendar day.
 */

const DAY_MS = 86_400_000;

/**
 * Sortable Accra day key, "YYYY-MM-DD". Ghana is GMT with no daylight saving,
 * so the UTC calendar date IS the Accra date — and unlike `chatDayKey`
 * ("DD/MM/YYYY", a display string) it compares correctly as text, which the
 * running totals below rely on.
 */
export function accraDayIso(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Accra day keys from `fromMs` to `toMs`, inclusive, oldest first. */
export function dayRange(fromMs: number, toMs: number, maxDays = 730): string[] {
  const keys: string[] = [];
  const start = Math.max(fromMs, toMs - (maxDays - 1) * DAY_MS);
  // Step by whole days from the start, then make sure today is included even
  // when the start's time-of-day pushes the last step past `toMs`.
  for (let t = start; t <= toMs; t += DAY_MS) {
    const key = accraDayIso(t);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  const last = accraDayIso(toMs);
  if (keys[keys.length - 1] !== last) keys.push(last);
  return keys;
}

/**
 * Running total per day. Events dated before the first day are folded into
 * the opening value, so a window that starts mid-history still shows the true
 * total rather than restarting at zero. Events after the last day are ignored.
 */
export function cumulativeByDay(
  events: { day: string; amount: number }[],
  days: string[],
): number[] {
  if (days.length === 0) return [];
  const first = days[0];
  const perDay = new Map<string, number>();
  let opening = 0;
  for (const event of events) {
    if (event.day < first) opening += event.amount;
    else perDay.set(event.day, (perDay.get(event.day) ?? 0) + event.amount);
  }
  let running = opening;
  return days.map((day) => {
    running += perDay.get(day) ?? 0;
    return running;
  });
}

export interface RankedBar {
  label: string;
  value: number;
}

/**
 * Students per course: DISTINCT students with a live (non-cancelled)
 * agreement, grouped by normalised course CODE — one real course can have
 * several `courses` rows (one per programme, see AGENTS.md), so grouping by
 * id would split ME 261 into four short bars. Falls back to the course name
 * when a row has no code. Largest first, then by label.
 */
export function studentsPerCourse(
  rows: {
    studentId: string;
    status: string;
    courseCode: string | null;
    courseName: string | null;
  }[],
  limit = 10,
): RankedBar[] {
  const students = new Map<string, { label: string; ids: Set<string> }>();
  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const code = row.courseCode ? normalizeCourseCode(row.courseCode) : "";
    const name = row.courseName?.trim() || "Unnamed course";
    const key = code || `name:${name.toLowerCase()}`;
    const entry = students.get(key) ?? {
      label: code ? `${code} · ${name}` : name,
      ids: new Set<string>(),
    };
    entry.ids.add(row.studentId);
    students.set(key, entry);
  }
  return rank(
    [...students.values()].map((entry) => ({
      label: entry.label,
      value: entry.ids.size,
    })),
    limit,
  );
}

/** Count of items per label (e.g. students per programme), largest first. */
export function countByLabel(
  labels: (string | null | undefined)[],
  limit = 10,
  emptyLabel = "Not set",
): RankedBar[] {
  const counts = new Map<string, number>();
  for (const raw of labels) {
    const label = raw?.trim() || emptyLabel;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return rank(
    [...counts.entries()].map(([label, value]) => ({ label, value })),
    limit,
  );
}

/**
 * Largest first, ties by label; anything past `limit` folds into one "Other"
 * bar so the chart never needs more rows than it has room for.
 */
function rank(bars: RankedBar[], limit: number): RankedBar[] {
  const sorted = [...bars].sort((a, b) =>
    b.value === a.value ? a.label.localeCompare(b.label) : b.value - a.value,
  );
  if (sorted.length <= limit) return sorted;
  const head = sorted.slice(0, limit - 1);
  const rest = sorted.slice(limit - 1).reduce((sum, bar) => sum + bar.value, 0);
  return [...head, { label: "Other", value: rest }];
}
