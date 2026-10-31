import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyTransfer,
  verifyWebhookSignature,
} from "@/services/payments/paystack";
import { reconcileChargeByReference } from "@/services/payments/reconcile";

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
  let event: {
    event?: string;
    data?: {
      reference?: string;
      transfer_code?: string;
      status?: string;
      reason?: string;
    };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  const eventName = event.event ?? "";
  const reference = event.data?.reference ?? "";
  const transferCode = event.data?.transfer_code ?? "";

  // ── Transfer lifecycle (0015): finalize the payout from Paystack's own
  // verdict. Verify-then-trust applies here too — the payload's status is
  // cross-checked against /transfer/verify before the DB is touched.
  if (eventName === "transfer.success" || eventName === "transfer.failed" || eventName === "transfer.reversed") {
    if (!transferCode) {
      return NextResponse.json({ received: true, ignored: "no transfer_code" });
    }
    const supabase = createAdminClient();

    const { data: payoutRow } = await supabase
      .from("payouts")
      .select("id, status")
      .eq("transfer_code", transferCode)
    .maybeSingle();
    const payout = payoutRow as { id: string; status: string } | null;

    if (!payout) {
      console.error(
        `[payments] transfer webhook for unknown transfer_code ${transferCode} — reconcile manually`,
      );
      return NextResponse.json({ received: true, unmatched: true });
    }

    try {
      // Verify-then-trust: re-fetch the transfer from Paystack.
      const transfer = await verifyTransfer(transferCode);

      if (transfer.status === "success") {
        const { error } = await supabase.rpc("payment_mark_payout_paid", {
          p_actor_id: null,
          p_payout_id: payout.id,
          p_transfer_code: transferCode,
        });
        if (error) {
          console.error(`[payments] finalize paid refused for ${transferCode}: ${error.message}`);
        }
      } else if (transfer.status === "failed" || transfer.status === "reversed") {
        const { error } = await supabase.rpc("payment_mark_payout_failed", {
          p_actor_id: null,
          p_payout_id: payout.id,
          p_reason: `Paystack transfer ${transferCode} ${transfer.status}`,
        });
        if (error) {
          console.error(`[payments] finalize failed refused for ${transferCode}: ${error.message}`);
        }
      } else {
        // otp/pending etc. — nothing to do yet; the sweep requeries later.
        return NextResponse.json({ received: true, transferStatus: transfer.status });
      }
      return NextResponse.json({ received: true, finalized: transfer.status });
    } catch (err) {
      // Verify unavailable — 500 so Paystack retries; both finalize RPCs are
      // idempotent, so replays are safe.
      console.error(`[payments] transfer verify failed for ${transferCode}`, err);
      return NextResponse.json({ error: "verify unavailable" }, { status: 500 });
    }
  }

  if (eventName !== "charge.success" || !reference) {
    // charge.failed / etc. — acked, not acted on.
    return NextResponse.json({ received: true, ignored: eventName || "unknown" });
  }

  // 4) Verify-then-trust + apply. The SAME helper runs on the return path
  // and from the cron sweep, so a missing/misconfigured webhook can no longer
  // strand a paid charge. It reads our row, asks Paystack, checks the amount
  // against what checkout stored, and calls the idempotent RPC.
  try {
    const outcome = await reconcileChargeByReference(reference);

    if (outcome.status === "not_found") {
      // No mapping: the init row was lost (rolled-back request). Log loudly
      // for reconciliation — never guess an installment from webhook data.
      console.error(
        `[payments] webhook for unknown reference ${reference} — reconcile manually`,
      );
      return NextResponse.json({ received: true, unmatched: true });
    }

    if (outcome.status === "already_paid") {
      // A replayed event, or the return path won the race. No-op.
      return NextResponse.json({ received: true, alreadyPaid: true });
    }

    if (outcome.status === "pending") {
      // Not actually paid (a spoofed success event with a valid key still
      // fails this). Ack so Paystack doesn't retry.
      return NextResponse.json({
        received: true,
        verifyStatus: outcome.paystackStatus,
      });
    }

    if (outcome.status === "refused") {
      // Guard violations (amount mismatch, replay, not payable) land here.
      // Return 200 — the event is recorded; retrying won't change the guard
      // outcome — but make it loud for reconciliation.
      console.error(`[payments] apply refused for ${reference}: ${outcome.reason}`);
      return NextResponse.json({ received: true, refused: outcome.reason });
    }

    // The student's "payment received" text is sent from
    // `reconcileChargeByReference` itself, so it fires no matter which of the
    // three entry points applied the charge — and exactly once per reference.
    return NextResponse.json({ received: true, payment: outcome.paymentId });
  } catch (err) {
    // Verify call failed (Paystack down / network) — return 500 so Paystack
    // retries; the RPC's idempotency makes replays safe.
    console.error(`[payments] verify failed for ${reference}`, err);
    return NextResponse.json({ error: "verify unavailable" }, { status: 500 });
  }
}
