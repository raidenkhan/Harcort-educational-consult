/**
 * Payment-plan bookkeeping (0032).
 *
 * A "plan" is an engagement where the student pays the semester fee in parts
 * instead of all at once. These helpers answer the three questions the admin
 * console asks about plans — is this student settled, how much is left, and
 * has the promised date passed — without any Supabase or React dependency, so
 * the rules are unit-tested rather than re-derived in JSX.
 */

export type PlanState = "paid" | "part" | "unpaid";

/** Where one agreement stands. A zero total counts as settled (nothing owed). */
export function planState(paidPesewas: bigint, totalPesewas: bigint): PlanState {
  if (totalPesewas <= BigInt(0)) return "paid";
  if (paidPesewas >= totalPesewas) return "paid";
  if (paidPesewas > BigInt(0)) return "part";
  return "unpaid";
}

/** "GH₵0 of GH₵1,200" style progress for a plan row. */
export function planProgress(paidPesewas: bigint, totalPesewas: bigint): number {
  if (totalPesewas <= BigInt(0)) return 1;
  const ratio = Number((paidPesewas * BigInt(100)) / totalPesewas) / 100;
  return Math.max(0, Math.min(1, ratio));
}

export interface PlanSummary {
  /** Distinct students with at least one non-cancelled agreement. */
  students: number;
  /** Students whose every agreement is fully paid. */
  paidInFull: number;
  /** Students who have paid something but still owe on at least one plan. */
  partPaid: number;
  /** Students who have paid nothing yet. */
  unpaid: number;
  collected: bigint;
  outstanding: bigint;
}

export interface PlanRow {
  studentId: string;
  paidPesewas: bigint;
  remainingPesewas: bigint;
  status: string;
}

/**
 * Roll agreements up PER STUDENT — the console's "how many students have paid
 * in full" is a question about people, not courses. A student with two
 * courses is one student, and is only "paid in full" when both are settled.
 */
export function summarizePlans(rows: PlanRow[]): PlanSummary {
  const byStudent = new Map<string, { paid: bigint; total: bigint }>();

  for (const row of rows) {
    if (row.status === "cancelled") continue;
    const current = byStudent.get(row.studentId) ?? {
      paid: BigInt(0),
      total: BigInt(0),
    };
    current.paid += row.paidPesewas;
    current.total += row.paidPesewas + row.remainingPesewas;
    byStudent.set(row.studentId, current);
  }

  const summary: PlanSummary = {
    students: byStudent.size,
    paidInFull: 0,
    partPaid: 0,
    unpaid: 0,
    collected: BigInt(0),
    outstanding: BigInt(0),
  };

  for (const { paid, total } of byStudent.values()) {
    summary.collected += paid;
    summary.outstanding += total - paid;
    const state = planState(paid, total);
    if (state === "paid") summary.paidInFull += 1;
    else if (state === "part") summary.partPaid += 1;
    else summary.unpaid += 1;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Promised full-payment date
// ---------------------------------------------------------------------------

/**
 * Accra's calendar day as `YYYY-MM-DD`.
 *
 * Ghana is GMT with no DST, but the SERVER may not be, and a promise date is
 * a calendar day, not an instant. `en-CA` formats as YYYY-MM-DD, so the
 * strings compare correctly as dates (unlike a DD/MM/YYYY key).
 */
const ACCRA_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Accra",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function accraDay(now: number): string {
  return ACCRA_DAY.format(new Date(now));
}

export type PromiseState = "none" | "upcoming" | "due" | "overdue";

/**
 * The promise relative to today:
 *   none     — no date agreed
 *   overdue  — the agreed day has passed and money is still owed
 *   due      — the agreed day is today
 *   upcoming — still in the future
 *
 * A settled plan is never "overdue": the date stops mattering once paid.
 */
export function promiseState(
  expectedFullPaymentAt: string | null | undefined,
  remainingPesewas: bigint,
  now: number,
): PromiseState {
  if (!expectedFullPaymentAt) return "none";
  if (remainingPesewas <= BigInt(0)) return "none";

  const today = accraDay(now);
  const due = expectedFullPaymentAt.slice(0, 10);

  if (due < today) return "overdue";
  if (due === today) return "due";
  return "upcoming";
}

/** Whole days from today until the promised date (negative = overdue). */
export function daysUntilPromise(
  expectedFullPaymentAt: string,
  now: number,
): number | null {
  const due = Date.parse(`${expectedFullPaymentAt.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${accraDay(now)}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(today)) return null;
  return Math.round((due - today) / 86_400_000);
}
