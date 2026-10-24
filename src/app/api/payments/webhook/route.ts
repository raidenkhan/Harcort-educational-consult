import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/postgres";
import {
  verifyTransaction,
  verifyTransfer,
  verifyWebhookSignature,
} from "@/services/payments/paystack";
import { notifySmsToProfiles } from "@/lib/sms";
import { formatGhs } from "@/lib/money";

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

  const supabase = createAdminClient();

  // Our row (written at checkout init) supplies the engagement/installment
  // mapping — never the payload. `fee_amount` (0034) and
  // `payment_request_id` (0032) are read tolerantly: a database that hasn't
  // applied one of those migrations must still reconcile.
  const baseColumns = ["id", "engagement_id", "installment_id", "status", "amount"];
  const optionalColumns = ["fee_amount", "payment_request_id"];

  const readPayment = (columns: string[]) =>
    supabase
      .from("payments")
      .select(columns.join(", "))
      .eq("paystack_reference", reference)
      .maybeSingle();

  let columns = [...baseColumns, ...optionalColumns];
  let paymentResult = await readPayment(columns);
  while (
    paymentResult.error &&
    isMissingColumn(paymentResult.error) &&
    columns.length > baseColumns.length
  ) {
    // PostgREST names the column it couldn't find ("Could not find the
    // 'fee_amount' column…"). Drop it and retry; if the message doesn't name
    // one, fall back to the columns every version has.
    const message = paymentResult.error.message ?? "";
    const missing = optionalColumns.filter((column) => message.includes(column));
    columns =
      missing.length > 0
        ? columns.filter((column) => !missing.includes(column))
        : baseColumns;
    paymentResult = await readPayment(columns);
  }

  const row = paymentResult.data as
    | {
        id: string;
        engagement_id: string;
        installment_id: string;
        status: string;
        amount: string | number;
        fee_amount?: string | number | null;
        payment_request_id?: string | null;
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

    // Amount comes from the VERIFY response, not the webhook body. Since
    // 0034 the student is charged the course amount PLUS Paystack's fee; the
    // stored row is the authority on both, and the agreement receives only
    // the course amount (so the 0029 guards and tutor earnings stay net).
    const verifiedAmount = BigInt(txn.amount);
    const courseAmount = pesewasFrom(row.amount);
    const feeAmount = pesewasFrom(row.fee_amount);
    if (verifiedAmount !== courseAmount + feeAmount) {
      // A charge we cannot map exactly is never applied on a guess. Ack so
      // Paystack stops retrying, and log loudly for reconciliation.
      console.error(
        `[payments] amount mismatch for ${reference}: expected ${courseAmount + feeAmount} (course ${courseAmount} + fee ${feeAmount}), verified ${verifiedAmount}`,
      );
      return NextResponse.json({ received: true, refused: "amount_mismatch" });
    }

    const { data: appliedId, error: applyError } = await supabase.rpc(
      "payment_apply_verified_payment",
      {
        p_engagement_id: row.engagement_id,
        p_installment_id: row.installment_id,
        p_paystack_reference: reference,
        p_amount: courseAmount.toString(),
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

    // The money is applied, so the admin-issued link that produced this charge
    // is now spent (0032 — single use). Marking it AFTER the apply means a
    // refused charge never burns the student's link. `status = open` keeps a
    // cancelled link cancelled.
    if (row.payment_request_id) {
      const { error: linkError } = await supabase
        .from("payment_requests")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", row.payment_request_id)
        .eq("status", "open");
      if (linkError) {
        console.error(
          `[payments] payment link ${row.payment_request_id} not marked paid: ${linkError.message}`,
        );
      }
    }

    // Text the student that the money landed. Best-effort — the money is
    // already applied either way, and a failed text never rolls that back.
    // The amount is the course portion (what the ledger applied), not the
    // gross that included Paystack's fee.
    await textPaymentReceived(supabase, row.engagement_id, courseAmount);

    return NextResponse.json({ received: true, payment: appliedId });
  } catch (err) {
    // Verify call failed (Paystack down / network) — return 500 so Paystack
    // retries; the RPC's idempotency makes replays safe.
    console.error(`[payments] verify failed for ${reference}`, err);
    return NextResponse.json({ error: "verify unavailable" }, { status: 500 });
  }
}

/**
 * Tell the student their payment landed. The amount is the course portion of
 * the verified charge (0034) — the part that was applied to their agreement,
 * not the gross that included Paystack's fee.
 */
async function textPaymentReceived(
  supabase: ReturnType<typeof createAdminClient>,
  engagementId: string,
  amountPesewas: bigint,
): Promise<void> {
  const { data } = await supabase
    .from("engagements")
    .select("student_id, profiles!engagements_student_id_fkey(full_name)")
    .eq("id", engagementId)
    .maybeSingle();

  if (!data) return;
  const row = data as unknown as {
    student_id: string;
    profiles?: { full_name?: string } | { full_name?: string }[] | null;
  };
  if (!row.student_id) return;

  notifySmsToProfiles(
    [row.student_id],
    `Harcourt: we received your payment of ${formatGhs(amountPesewas)} toward your course fee. Thank you.`,
    "payment",
  );
}

/**
 * PostgREST serializes BIGINT as a JSON number (or a string when it is very
 * large), and `BigInt("250.00")` throws — normalise through Number first.
 * Money here is whole pesewas, far inside the safe-integer range.
 */
function pesewasFrom(value: string | number | null | undefined): bigint {
  if (value == null) return BigInt(0);
  return BigInt(Math.round(Number(value)));
}
