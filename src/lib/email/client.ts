import { Resend } from "resend";

/**
 * Email client — Resend (https://resend.com).
 *
 * Free tier: 3,000 emails/month · 100/day · no credit card. Everything is
 * fail-safe: when RESEND_API_KEY is missing (local dev, CI) every send is a
 * silent no-op, so the app never breaks just because email isn't configured.
 *
 * ⚠️ SERVER ONLY — never import this from a Client Component.
 */

let client: Resend | null = null;

/** True when an API key is configured — cheap guard before doing lookups. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function getEmailClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

/**
 * From-address. Resend requires a verified domain for real recipients — the
 * default onboarding@resend.dev only delivers to the account owner's email.
 * Set EMAIL_FROM once a domain is verified, e.g.
 *   EMAIL_FROM="Harcourt Educational Consult <notifications@yourdomain.com>"
 */
export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Harcourt Educational Consult <onboarding@resend.dev>";

/** Public origin for links inside emails (chat, admin, tutor pages). */
export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
