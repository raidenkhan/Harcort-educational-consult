/**
 * Postgres/PostgREST error classification for RPC calls.
 *
 * Sign-up has to survive a database that hasn't caught up with the newest
 * migration: a missing function overload must be distinguishable from a real
 * failure (duplicate email, constraint violation), because only the former is
 * safe to retry against the older signature. Pure so the detection is
 * unit-tested rather than trusted.
 */

/** 42883 = undefined_function; PGRST202 = PostgREST can't find the function in
 *  its schema cache. */
const UNKNOWN_FUNCTION_CODES = ["42883", "PGRST202"];

export function isUnknownFunction(error: {
  code?: string | null;
  message: string;
}): boolean {
  return (
    UNKNOWN_FUNCTION_CODES.includes(error.code ?? "") ||
    /could not find the function|function .* does not exist/i.test(error.message)
  );
}
