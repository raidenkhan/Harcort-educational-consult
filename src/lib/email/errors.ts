/**
 * Turn a Resend API failure into a sentence a person can act on.
 *
 * Two things make this necessary. First, the Resend SDK RESOLVES on an API
 * error (`{ data: null, error }`) instead of throwing — a 403 is a normal
 * return value, so a caller that ignores it reports success for a send that
 * never happened. Second, the raw message cannot be shown to users: Resend's
 * testing-mode rejection reads "You can only send testing emails to your own
 * email address (someone@example.com)…", and that string reaches the student
 * on the forgot-password form, printing a third party's address on a page.
 *
 * So: the raw error goes to the server log, and the user gets this. Kept pure
 * (no SDK or env import) so it can be unit-tested like the other lib helpers.
 */

export type EmailSendError = {
  name?: string;
  message?: string;
} | null | undefined;

/** Resend answer when `EMAIL_FROM` is still `onboarding@resend.dev` and the
 *  recipient isn't the Resend account owner — i.e. the domain isn't verified
 *  yet. Anonymous on purpose: naming the owner would leak their address. */
const SETUP_HINT =
  "Harcourt's email can't reach you yet — the sending domain isn't verified. Ask the team for a reset code.";

export function emailErrorReason(error: EmailSendError): string {
  const name = error?.name ?? "";
  const message = error?.message ?? "";

  // 403 validation_error. The SDK reports the testing-mode case as
  // `validation_error`, so the message is what distinguishes it.
  if (name === "validation_error" && /testing emails/i.test(message)) {
    return SETUP_HINT;
  }

  // The key is wrong or was revoked — nothing retryable from the user's side,
  // and the phrasing must not invite them to keep hammering the form.
  if (
    name === "missing_api_key" ||
    name === "invalid_api_key" ||
    name === "restricted_api_key"
  ) {
    return "Email is temporarily unavailable. Please ask the Harcourt team for help.";
  }

  // Free-tier ceilings: 100/day / 3,000/month on Resend. Transient — a retry
  // a few minutes later (or tomorrow) works.
  if (
    name === "daily_quota_exceeded" ||
    name === "monthly_quota_exceeded" ||
    name === "rate_limit_exceeded"
  ) {
    return "Too many emails have gone out in the last few hours. Please try again shortly.";
  }

  return "We couldn't send that email. Please try again.";
}
