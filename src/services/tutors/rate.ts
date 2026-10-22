/**
 * The tutor's advertised rate — PER SEMESTER.
 *
 * 0028 renamed the column `rate_per_hour` → `rate_per_semester`: the label
 * had said per semester for a while, and the column was the last place the
 * old framing survived.
 *
 * The app tolerates BOTH names so it can be deployed before the migration is
 * applied: reads take whichever column the row carries, writes try the new
 * one and fall back to the old (see services/tutors/mutations.ts).
 */

/** A row that may carry the rate under either column name. */
export interface RateColumns {
  rate_per_semester?: number | null;
  rate_per_hour?: number | null;
}

/** The rate, whichever column this row carries. Null when there is none. */
export function readRate(row: RateColumns | null | undefined): number | null {
  if (!row) return null;
  return row.rate_per_semester ?? row.rate_per_hour ?? null;
}
