import { NextResponse, after, type NextRequest } from "next/server";
import { drainPaymentOutbox } from "@/lib/email/outbox";
import { safeNextPath } from "@/lib/auth/redirect";
import { reconcileChargeByReference } from "@/services/payments/reconcile";

/**
 * GET /api/payments/return — where Paystack sends the student's browser.
 *
 * Paystack appends `?reference=` (and `?trx_ref=`) to the callback URL. This
 * route verifies that reference against Paystack and applies it through the
 * SAME `reconcileChargeByReference` helper the webhook uses, then sends the
 * student onward to `next` with a `payment_status` marker for the banner.
 *
 * This is the fix for a silent failure mode that left every production
 * charge `initialized` for ever: if the Paystack dashboard's webhook URL is
 * unset or points at a host that redirects POSTs (apex → www), the webhook
 * never arrives. The browser still comes back, and that is enough.
 *
 * A return-path hit is NOT proof of payment — Paystack is asked directly and
 * the database re-checks the amount under locks. Visiting this URL with a
 * forged reference can only ever reconcile a charge Paystack says is real.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const reference = (
    url.searchParams.get("reference") ??
    url.searchParams.get("trx_ref") ??
    ""
  ).trim();
  const next =
    safeNextPath(url.searchParams.get("next")) ?? "/dashboard?payment=return";

  let confirmed: "received" | "pending" | "refused" = "pending";
  if (reference) {
    try {
      const outcome = await reconcileChargeByReference(reference);
      if (outcome.status === "applied" || outcome.status === "already_paid") {
        confirmed = "received";
      } else if (outcome.status === "refused") {
        // Paid but our guards refused it — loud for reconciliation, still a
        // normal redirect so the student isn't stranded on an API response.
        // The marker tells the dashboard to ask for the reference instead of
        // promising a retry that will never happen.
        confirmed = "refused";
        console.error(
          `[payments] return refused ${reference}: ${outcome.reason}`,
        );
      }
    } catch (err) {
      // Paystack verify unavailable, or the DB read failed. The sweep will
      // retry; the student still needs to land somewhere useful.
      console.error(`[payments] return reconcile failed for ${reference}`, err);
    }
  }

  // The DB RPC enqueued the student/tutor/admin emails in the same
  // transaction as the money. Drain them after the redirect flushes so
  // nobody waits on Resend.
  const drain = () => {
    void drainPaymentOutbox().catch((err) => {
      console.error("[outbox] drain after payment return failed", err);
    });
  };
  try {
    after(drain);
  } catch {
    drain();
  }

  const target = new URL(next, url.origin);
  target.searchParams.set("payment", "return");
  target.searchParams.set("payment_status", confirmed);
  return NextResponse.redirect(target);
}
