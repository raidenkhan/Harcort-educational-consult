/**
 * Turn a Paystack refusal at checkout into a sentence a student can act on.
 * Paystack's own wording ("Paystack /transaction/initialize failed: Invalid
 * Email Address Passed") is developer-facing; the raw text still goes to the
 * server log via the caller. Pure, so it is unit-tested.
 */
export function paystackCheckoutMessage(raw: string, email?: string | null): string {
  if (/invalid email/i.test(raw)) {
    return `Paystack couldn't accept the email address on your account${email ? ` (${email})` : ""}, so the payment wasn't started. Please contact the Harcourt team to update it, then try again.`;
  }
  if (/amount/i.test(raw)) {
    return "Paystack couldn't accept this amount, so the payment wasn't started. Please try again, or contact the Harcourt team if it keeps happening.";
  }
  if (/currency/i.test(raw)) {
    return "Paystack couldn't accept this currency for your account. Please contact the Harcourt team.";
  }
  return "Paystack couldn't start this payment. Nothing has been charged — please try again, or contact the Harcourt team if it keeps happening.";
}
