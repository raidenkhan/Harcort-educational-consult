/**
 * Postgres/PostgREST error classification for column renames.
 *
 * A renamed column must be distinguishable from a real write failure: the
 * former is safe to retry against the old name, the latter must surface. The
 * app ships migrations separately from the code, so a deploy can reach a
 * database that hasn't caught up yet.
 */

/** 42703 = undefined_column; PGRST204 = PostgREST can't find the column in
 *  its schema cache. */
const MISSING_COLUMN_CODES = ["42703", "PGRST204"];

export function isMissingColumn(error: {
  code?: string | null;
  message: string;
}): boolean {
  return (
    MISSING_COLUMN_CODES.includes(error.code ?? "") ||
    /column .* does not exist|unknown column/i.test(error.message)
  );
}
