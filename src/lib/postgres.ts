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

/** 42P01 = undefined_table; PGRST205 = PostgREST can't find the table in its
 *  schema cache. */
const MISSING_TABLE_CODES = ["42P01", "PGRST205"];

/**
 * A table (or function-backed relation) the deploy expects but the database
 * has not created yet. Callers use this to degrade with a clear "latest
 * database update" message instead of surfacing a raw Postgres error — the
 * same contract `isMissingColumn` gives renamed columns.
 */
export function isMissingTable(error: {
  code?: string | null;
  message: string;
}): boolean {
  return (
    MISSING_TABLE_CODES.includes(error.code ?? "") ||
    /relation .* does not exist|Could not find the table/i.test(error.message)
  );
}
