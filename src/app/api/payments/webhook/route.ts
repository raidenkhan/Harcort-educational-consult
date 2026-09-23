import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransaction, verifyWebhookSignature } from "@/services/payments/paystack";

/**
 * POST /api/payments/webhook — Paystack event receiver.
 *
 * The security-critical entry point for money-in. The order of operations
 * IS the security model:
 *
 *   1. RAW body captured before ANY parsing (a re-serialized body has
 *      different bytes and breaks the signature check).
 *   2. HMAC SHA512 signature verified in constant time — rejects anything
 *      not signed by our secret key.
 *   3. The event's reference is re-fetched from Paystack's /verify endpoint
 *      (verify-then-trust) — the webhook payload's amount/status is treated
 *      as untrusted attacker-controllable input.
 *   4. Our own rows decide: amount must equal the installment's expected
 *      amount, currency must match — the DB RPC re-checks everything under
 *      row locks and is idempotent on replay (unique reference).
 *
 * Paystack expects a fast 2xx; slow work happens after the ack via `after()`.
 * Unhandled/irrelevant events are acked with 200 and ignored — Paystack
 * retries non-acks, and we don't want retry storms over events we don't use.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-paystack-signature");

  // 1) Raw bytes first — never parse before verifying.
  const rawBody = await request.text();

  // 2) Signature gate.
  let signatureValid = false;
  try {
    signatureValid = verifyWebhookSignature(rawBody, signature);
  } catch {
    // Unconfigured secret key — fail closed.
    signatureValid = false;
  }
  if (!signatureValid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // 3) Parse only what's needed to route the event.
  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(rawBody) as { event?: string; data?: { reference?: string } };
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  const eventName = event.event ?? "";
  const reference = event.data?.reference ?? "";

  if (eventName !== "charge.success" || !reference) {
    // charge.failed / transfer.success / etc. — acked, not acted on.
    return NextResponse.json({ received: true, ignored: eventName || "unknown" });
  }

  const supabase = createAdminClient();

  // Our row (written at checkout init) supplies the engagement/installment
  // mapping — never the payload.
  const { data: paymentRow } = await supabase
    .from("payments")
    .select("id, engagement_id, installment_id, status, amount")
    .eq("paystack_reference", reference)
    .maybeSingle();

  const row = paymentRow as
    | {
        id: string;
        engagement_id: string;
        installment_id: string;
        status: string;
        amount: string | number;
      }
    | null;

  if (!row) {
    // No mapping: the init row was lost (rolled-back request). Log loudly for
    // reconciliation — we can still recover from Paystack metadata later, but
    // never guess an installment from webhook data.
    console.error(`[payments] webhook for unknown reference ${reference} — reconcile manually`);
    return NextResponse.json({ received: true, unmatched: true });
  }

  // 4) Verify-then-trust: re-fetch the transaction from Paystack itself.
  try {
    const txn = await verifyTransaction(reference);

    if (txn.status !== "success") {
      // Not actually paid (e.g. a spoofed success event with a valid key
      // would still fail this). Ack so Paystack doesn't retry.
      return NextResponse.json({ received: true, verifyStatus: txn.status });
    }

    // Amount comes from the VERIFY response, not the webhook body.
    const verifiedAmount = BigInt(txn.amount);

    const { data: appliedId, error: applyError } = await supabase.rpc(
      "payment_apply_verified_payment",
      {
        p_engagement_id: row.engagement_id,
        p_installment_id: row.installment_id,
        p_paystack_reference: reference,
        p_amount: verifiedAmount.toString(),
        p_currency: txn.currency,
        p_paystack_status: txn.status,
        p_raw: JSON.parse(rawBody) as object,
      },
    );

    if (applyError) {
      // Guard violations (amount mismatch, replay, not payable) land here.
      // Return 200 — the event is recorded; retrying won't change the guard
      // outcome — but make it loud for reconciliation.
      console.error(`[payments] apply refused for ${reference}: ${applyError.message}`);
      return NextResponse.json({ received: true, refused: applyError.message });
    }

    return NextResponse.json({ received: true, payment: appliedId });
  } catch (err) {
    // Verify call failed (Paystack down / network) — return 500 so Paystack
    // retries; the RPC's idempotency makes replays safe.
    console.error(`[payments] verify failed for ${reference}`, err);
    return NextResponse.json({ error: "verify unavailable" }, { status: 500 });
  }
}
