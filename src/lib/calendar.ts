/**
 * Calendar math for the timetable views — month matrix + week strip.
 *
 * All "which day is this session on" decisions use ACCRA day keys in ISO
 * form (YYYY-MM-DD, en-CA locale gives exactly that), so a session always
 * lands on the day the user in Ghana sees — and keys parse cleanly for
 * day-difference math.
 *
 * Grid cells are built as UTC-noon instants — each cell unambiguously
 * represents one calendar day regardless of locale.
 *
 * Pure module: no Date.now() (callers pass `now`), fully unit-testable.
 */

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Accra",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 0 = Sunday … 6 = Saturday (matches getDay). */
const WEEK_START = 0;

/** How many days of "past" the week view shows by default. */
export const WEEK_VIEW_DAYS = 7;

/** "2026-09-23" (Accra, ISO) for a timestamp. */
export function accraDayKey(ts: number): string {
  return DAY_KEY_FORMATTER.format(new Date(ts));
}

/** Monday-agnostic month matrix: weeks × 7 UTC-noon Dates. */
export function monthMatrix(year: number, monthIndex: number): Date[][] {
  const first = new Date(Date.UTC(year, monthIndex, 1, 12));
  const matrix: Date[][] = [];
  let cursor = new Date(first);
  // Back up to the first cell (WEEK_START-aligned) of the grid.
  cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() - WEEK_START + 7) % 7));

  for (let week = 0; week < 6; week++) {
    const row: Date[] = [];
    for (let day = 0; day < 7; day++) {
      row.push(new Date(cursor));
      cursor = new Date(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    matrix.push(row);
    // Stop after a row that ends past the month's last day (no wasted rows).
    const lastCell = row[6];
    const nextMonthStart = new Date(Date.UTC(year, monthIndex + 1, 1, 12));
    if (lastCell.getTime() >= nextMonthStart.getTime()) break;
  }
  return matrix;
}

/** The 7 UTC-noon days of the week containing `ts` (WEEK_START-aligned). */
export function weekStrip(ts: number): Date[] {
  const day = new Date(ts);
  day.setUTCHours(12, 0, 0, 0);
  // Accra day-of-week via the key's date part is locale-free; getUTCDay on a
  // noon-instant of the Accra day equals the user's weekday (GMT offset 0).
  const strip: Date[] = [];
  const start = new Date(day);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() - WEEK_START + 7) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    strip.push(d);
  }
  return strip;
}

export interface CalendarSession {
  id: string;
  /** Epoch ms of the session start. */
  start: number;
  /** Epoch ms of the session end. */
  end: number;
  topic: string | null;
  /** "cancelled" | "scheduled" */
  status: string;
  /** Who still owes a tick — drives the "action needed" dot. */
  tutorConfirmed: boolean;
  studentConfirmed: boolean;
  counterpartName: string;
}

/** Group sessions by Accra day key. */
export function groupByDay<T extends CalendarSession>(
  sessions: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const s of sessions) {
    const key = accraDayKey(s.start);
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  return map;
}

/** True when the session's Accra day equals the given cell's Accra day. */
export function isOnDay(session: CalendarSession, cell: Date): boolean {
  return accraDayKey(session.start) === accraDayKey(cell.getTime());
}

/** Number of Accra days between two timestamps (a - b, day granularity). */
export function daysBetween(aTs: number, bTs: number): number {
  const a = accraDayKey(aTs);
  const b = accraDayKey(bTs);
  const aMs = Date.parse(`${a}T00:00:00Z`);
  const bMs = Date.parse(`${b}T00:00:00Z`);
  return Math.round((aMs - bMs) / 86_400_000);
}

/** Session display label for a grid block: "14:00" start (Accra). */
export function sessionStartTime(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}
