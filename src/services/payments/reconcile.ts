import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/postgres";
import { notifySmsToProfiles } from "@/lib/sms";
import { formatGhs } from "@/lib/money";
import { verifyTransaction } from "./paystack";

/**
 * Charge reconciliation — the one place a Paystack charge is applied.
 *
 * Why this exists: the webhook is the primary path, but it is also the
 * fragile one. If the Paystack dashboard has no webhook URL (or the wrong
 * one — an apex host that redirects a POST), every charge stays `initialized`
 * for ever: the student has paid, the tutor never sees it, no email is sent,
 * and nothing retries. That is exactly what happened in production.
 *
 * So the same verify-then-apply logic runs from three entry points:
 *
 *   1. POST /api/payments/webhook   — the normal, fast path
 *   2. GET  /api/payments/return    — the browser coming back from Paystack
 *   3. GET  /api/payments/sweep     — the cron safety net
 *
 * Security is unchanged: the amount comes from Paystack's /verify response,
 * it must equal the row we wrote at checkout (`amount + fee_amount`), and the
 * database RPC re-checks the installment, currency, overpay and idempotency
 * under row locks. A return-path hit is NOT trusted as proof of payment —
 * Paystack is asked directly.
 */

export type ReconcileOutcome =
  | {
      status: "applied";
      paymentId: string;
      engagementId: string;
      /** The NET course amount applied to the agreement (excludes the fee). */
      courseAmount: bigint;
    }
  /** The row was already applied (webhook + return both ran). Idempotent. */
  | { status: "already_paid"; engagementId: string }
  /** No payment row for this reference — never guess an installment. */
  | { status: "not_found" }
  /** Paystack says it is not paid (yet) — abandoned, failed, pending. */
  | { status: "pending"; paystackStatus: string }
  /** Paid, but our own guards refused it. Logged loudly, never applied. */
  | { status: "refused"; reason: string };

interface PaymentRow {
  id: string;
  engagement_id: string;
  installment_id: string;
  status: string;
  paystack_status?: string | null;
  amount: string | number;
  fee_amount?: string | number | null;
  payment_request_id?: string | null;
}

/** Columns every version of the schema has, plus the 0032/0034 extras. */
const BASE_COLUMNS = ["id", "engagement_id", "installment_id", "status", "paystack_status", "amount"];
const OPTIONAL_COLUMNS = ["fee_amount", "payment_request_id"];

/**
 * A guard refusal no retry can change. The money moved at Paystack, but the
 * ledger will never accept it for this row (wrong amount, wrong currency, a
 * missing or already-settled installment), so the row must stop being
 * re-verified — otherwise the sweep picks the same five dead rows for ever.
 * Anything else (a connection drop, a permissions failure) is left
 * 'initialized' for the next run to retry.
 */
const DEFINITIVE_REFUSAL =
  /(installment_not_found|installment_not_payable|currency_mismatch|amount_mismatch)\b/;

export function isDefinitiveRefusal(message: string): boolean {
  return DEFINITIVE_REFUSAL.test(message);
}

/** PostgREST serializes BIGINT as a number or a string; money is whole
 *  pesewas, far inside the safe-integer range. */
export function pesewasFrom(value: string | number | null | undefined): bigint {
  if (value == null) return BigInt(0);
  return BigInt(Math.round(Number(value)));
}

/**
 * Read our own row by reference, tolerating a database that has not applied
 * 0034 (`fee_amount`) or 0032 (`payment_request_id`) yet. PostgREST names the
 * column it could not find, so we drop exactly that one and retry.
 */
async function readPaymentRow(reference: string): Promise<PaymentRow | null> {
  const supabase = createAdminClient();
  const read = (columns: string[]) =>
    supabase
      .from("payments")
      .select(columns.join(", "))
      .eq("paystack_reference", reference)
      .maybeSingle();

  let columns = [...BASE_COLUMNS, ...OPTIONAL_COLUMNS];
  let result = await read(columns);
  while (
    result.error &&
    isMissingColumn(result.error) &&
    columns.length > BASE_COLUMNS.length
  ) {
    const message = result.error.message ?? "";
    const missing = OPTIONAL_COLUMNS.filter((column) => message.includes(column));
    columns =
      missing.length > 0
        ? columns.filter((column) => !missing.includes(column))
        : BASE_COLUMNS;
    result = await read(columns);
  }
  if (result.error) {
    throw new Error(`payment read failed: ${result.error.message}`);
  }
  return (result.data as unknown as PaymentRow | null) ?? null;
}

/**
 * Verify one reference against Paystack and apply it if it is genuinely paid.
 *
 * Safe to call repeatedly: the RPC short-circuits an already-`paid` row, and
 * this function does the same before spending a Paystack call.
 */
export async function reconcileChargeByReference(
  reference: string,
): Promise<ReconcileOutcome> {
  const ref = reference.trim();
  if (!ref) return { status: "not_found" };

  const row = await readPaymentRow(ref);
  if (!row) return { status: "not_found" };
  if (row.status === "paid") {
    return { status: "already_paid", engagementId: row.engagement_id };
  }
  if (row.status === "failed" && row.paystack_status === "success") {
    // Paystack charged, the ledger refused, and the row was closed with the
    // reason in `raw_payload.note` (see below). Replaying the webhook or
    // refreshing the return URL must not re-run a doomed apply.
    return { status: "refused", reason: "previously_refused" };
  }

  const supabase = createAdminClient();

  // A row we marked 'failed' is NOT proof that no money moved: an init whose
  // response we never saw, or a checkout page the student completed after the
  // sweep had already called it abandoned, both end up 'failed' with a real
  // charge behind them. Only 'paid' is safe to short-circuit, so always ask
  // Paystack. (One extra verify call on a dead reference, at most.)
  const txn = await verifyTransaction(ref);
  if (txn.status !== "success") {
    // Abandoned / failed checkouts are terminal for THIS reference. Marking
    // the row 'failed' takes it out of the sweep's queue — otherwise every
    // abandoned checkout stayed 'initialized' for ever, and because the sweep
    // reads the five OLDEST rows, five abandoned attempts were enough to
    // starve it permanently (new charges would never be checked again).
    if (txn.status === "abandoned" || txn.status === "failed") {
      const { error } = await supabase
        .from("payments")
        .update({ status: "failed", paystack_status: txn.status })
        .eq("id", row.id)
        .eq("status", "initialized");
      if (error) {
        console.error(
          `[payments] could not close abandoned charge ${ref}: ${error.message}`,
        );
      }
    }
    return { status: "pending", paystackStatus: txn.status };
  }

  // Since 0034 the student is charged course + fee; the agreement receives
  // only the course amount. The stored row is the authority on both, so a
  // config change after checkout cannot re-price a live charge.
  const courseAmount = pesewasFrom(row.amount);
  const feeAmount = pesewasFrom(row.fee_amount);
  const verifiedAmount = BigInt(txn.amount);
  if (verifiedAmount !== courseAmount + feeAmount) {
    return {
      status: "refused",
      reason: `amount_mismatch: expected ${courseAmount + feeAmount} (course ${courseAmount} + fee ${feeAmount}), verified ${verifiedAmount}`,
    };
  }

  const { data: paymentId, error: applyError } = await supabase.rpc(
    "payment_apply_verified_payment",
    {
      p_engagement_id: row.engagement_id,
      p_installment_id: row.installment_id,
      p_paystack_reference: ref,
      p_amount: courseAmount.toString(),
      p_currency: txn.currency,
      p_paystack_status: txn.status,
      // The verify response, not a browser/webhook body — the RPC's raw
      // payload is for reconciliation, never for decisions.
      p_raw: txn as unknown as object,
    },
  );
  if (applyError) {
    // The webhook, the return path and the sweep can all reconcile the same
    // reference at once. They serialize on the installment row lock, so the
    // loser then trips the overpay guard ("installment has 0 outstanding")
    // even though the charge was applied correctly by the winner. Re-read the
    // row: if it is paid now, this was a race, not a refusal — saying
    // "amount_mismatch" here sent false alarms to the logs and to Paystack.
    try {
      const after = await readPaymentRow(ref);
      if (after?.status === "paid") {
        return { status: "already_paid", engagementId: after.engagement_id };
      }
    } catch (readError) {
      console.error(
        `[payments] could not re-read ${ref} after a refused apply`,
        readError,
      );
    }

    // Paid at Paystack, refused by the ledger, and not a race. Close the row
    // so the sweep stops re-verifying it (five of these would starve the
    // oldest-first queue), and leave the reason where an admin already looks:
    // `raw_payload.note` is rendered in the admin payment log. `failed` is the
    // only terminal non-paid status; `paystack_status = success` records that
    // the money DID move, so this is a refund to chase, not a failed attempt.
    if (isDefinitiveRefusal(applyError.message)) {
      const { error: closeError } = await supabase
        .from("payments")
        .update({
          status: "failed",
          paystack_status: txn.status,
          raw_payload: {
            note: `Paystack charged ${verifiedAmount} pesewas; the ledger refused it: ${applyError.message}`,
          },
        })
        .eq("id", row.id)
        .eq("status", "initialized");
      if (closeError) {
        console.error(
          `[payments] could not close refused charge ${ref}: ${closeError.message}`,
        );
      }
    }

    return { status: "refused", reason: applyError.message };
  }
  if (!paymentId) {
    return { status: "refused", reason: "payment_apply_verified_payment returned no id" };
  }

  // 0032 — the admin-issued link that produced this charge is now spent.
  // Marking it AFTER the apply means a refused charge never burns the link.
  // `status = open` keeps a cancelled link cancelled.
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

  // Tell the student the money landed. This runs from the one place a charge
  // is applied, so it does not matter which entry point won the race; the
  // reference-based dedupe key means two concurrent applies still send ONE
  // text. (It used to live only in the webhook, so a charge applied by the
  // return path never texted anybody.)
  await textPaymentReceived(row.engagement_id, courseAmount, ref);

  return {
    status: "applied",
    paymentId: String(paymentId),
    engagementId: row.engagement_id,
    courseAmount,
  };
}

/**
 * Text the student their payment landed. Best-effort: the money is already
 * applied, so a notification failure is logged and never rolled back.
 */
async function textPaymentReceived(
  engagementId: string,
  amountPesewas: bigint,
  reference: string,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("engagements")
      .select("student_id")
      .eq("id", engagementId)
      .maybeSingle();
    const studentId = (data as { student_id?: string } | null)?.student_id;
    if (!studentId) return;
    notifySmsToProfiles(
      [studentId],
      `Harcourt: we received your payment of ${formatGhs(amountPesewas)} toward your course fee. Thank you.`,
      "payment",
      `payment:${reference}`,
    );
  } catch (err) {
    console.error("[payments] payment-received SMS failed", err);
  }
}

/**
 * Reconcile the charges a returned student may have just made. Used by the
 * sweep, where a stale `initialized` row is the only signal that a webhook
 * was missed. Oldest first, bounded so one cron run stays fast.
 */
export async function reconcileStaleCharges(
  olderThanMinutes = 10,
  limit = 5,
): Promise<{ checked: number; applied: number }> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data, error } = await supabase
    .from("payments")
    .select("paystack_reference")
    .eq("status", "initialized")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error(`[payments] stale charge query failed: ${error.message}`);
    return { checked: 0, applied: 0 };
  }

  let applied = 0;
  let checked = 0;
  for (const raw of data ?? []) {
    const reference = (raw as { paystack_reference: string }).paystack_reference;
    if (!reference) continue;
    checked += 1;
    try {
      const outcome = await reconcileChargeByReference(reference);
      if (outcome.status === "applied") applied += 1;
      if (outcome.status === "refused") {
        console.error(
          `[payments] sweep refused ${reference}: ${outcome.reason}`,
        );
      }
    } catch (err) {
      // Paystack unavailable — the next run retries. Never let one bad
      // reference abort the sweep.
      console.error(`[payments] sweep reconcile failed for ${reference}`, err);
    }
  }
  return { checked, applied };
}
