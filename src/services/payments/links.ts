import { createHash, randomBytes } from "node:crypto";

/**
 * Part-payment link tokens (0032).
 *
 * The URL carries the raw token; the database stores only its SHA-256 hash.
 * Same rule as sessions (`lib/auth/session.ts`) and password-reset codes: a
 * dump of the table cannot be turned into working payment links. The raw
 * token exists in exactly two places — the redirect we hand the admin, and
 * the student's browser.
 *
 * Kept separate from the server actions so the hashing is unit-tested.
 */

/** 256 bits of entropy, URL-safe (43 chars, no padding). */
export function generatePaymentToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The only form of the token that is ever persisted. */
export function hashPaymentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** `/pay/<token>` — the path the admin sends. The absolute origin is added
 *  in the browser (the console must work on localhost and production alike). */
export function paymentLinkPath(token: string): string {
  return `/pay/${encodeURIComponent(token)}`;
}

/** Shape check before hashing a URL segment — rejects junk cheaply and keeps
 *  obviously malformed tokens out of the database lookup. */
export function isPlausiblePaymentToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(token);
}
