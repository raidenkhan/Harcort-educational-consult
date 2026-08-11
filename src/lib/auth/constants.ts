/** Shared auth constants. Kept dependency-free so middleware can import
 *  them without pulling in node:crypto or next/headers. */

export const SESSION_COOKIE = "harcot_session";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
