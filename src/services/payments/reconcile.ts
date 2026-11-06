import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn, isMissingTable } from "@/lib/postgres";
import { notifySmsToProfiles } from "@/lib/sms";
import { formatGhs } from "@/lib/money";
import {
  isReferenceNotFound,
  verifyTransaction,
  type PaystackTransaction,
} from "./paystack";
import { seatGroupBookingForEngagement } from "@/services/groups/booking";

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
  /** NULL since 0039 — a one-off charge settles the agreement itself. */
  installment_id: string | null;
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
  /(installment_not_found|installment_not_payable|currency_mismatch|amount_mismatch|batch_not_payable|batch_empty|reference_mismatch)\b/;

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
  // A cart/booking charge (0040): Paystack knows the BATCH reference; the
  // per-course `payments` rows carry `<reference>-B01…` and are applied by
  // the batch RPC, never one at a time.
  if (!row) return reconcileBatchByReference(ref);
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
  let txn: PaystackTransaction;
  try {
    txn = await verifyTransaction(ref);
  } catch (err) {
    if (!isReferenceNotFound(err)) throw err;

    // Paystack has no such transaction, so this can never resolve. Close it —
    // an unclosed row stays the OLDEST `initialized` row, and the sweep only
    // ever reads the five oldest, so a few of these would block reconciliation
    // of every newer charge for ever.
    const { error } = await supabase
      .from("payments")
      .update({ status: "failed", paystack_status: "not_found" })
      .eq("id", row.id)
      .eq("status", "initialized");
    if (error) {
      console.error(
        `[payments] could not close unknown reference ${ref}: ${error.message}`,
      );
    }
    return { status: "refused", reason: "reference_not_found" };
  }
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
    // reference at once. They serialize on the ENGAGEMENT row lock (0039), so
    // the loser then trips the overpay guard ("agreement has 0 outstanding")
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

  // A group booking is also a group seat: the payment RPC (0038) seats the
  // student when the tutor already has a group for the course; this closes
  // the gap it left (no group yet) and covers the admin part-payment path.
  // Idempotent — never throws.
  await seatGroupBookingForEngagement(row.engagement_id);

  return {
    status: "applied",
    paymentId: String(paymentId),
    engagementId: row.engagement_id,
    courseAmount,
  };
}

interface BatchRow {
  id: string;
  status: string;
  amount: string | number;
  fee_amount: string | number | null;
  raw_payload: { note?: string } | null;
}

/**
 * Close a batch and its item rows. Used for a checkout Paystack never saw or
 * that was abandoned/failed, and for a charge the ledger definitively refused
 * (with `note`). Only touches rows still `initialized`.
 */
async function closeBatch(
  batchId: string,
  paystackStatus: string,
  note?: string,
): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("payment_batches")
    .update({
      status: "failed",
      updated_at: now,
      ...(note ? { raw_payload: { note } } : {}),
    })
    .eq("id", batchId)
    .eq("status", "initialized");
  const { error: itemError } = await supabase
    .from("payments")
    .update({ status: "failed", paystack_status: paystackStatus })
    .eq("batch_id", batchId)
    .eq("status", "initialized");
  if (error || itemError) {
    console.error(
      `[payments] could not close batch ${batchId}: ${(error ?? itemError)?.message}`,
    );
  }
}

/** The agreements a batch pays for, in item order. */
async function batchEngagementIds(batchId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("payment_batch_items")
    .select("engagement_id, idx")
    .eq("batch_id", batchId)
    .order("idx", { ascending: true });
  return (data ?? []).map((row) => (row as { engagement_id: string }).engagement_id);
}

/**
 * The batch twin of the single-charge path above (0040 — cart checkout and
 * the tutor card's Book dialog). Same contract: ask Paystack, require the
 * gross charge to equal what checkout stored (`amount + fee_amount`), then let
 * `payment_apply_verified_batch` apply each item under the same row locks the
 * single path uses. Idempotent: a paid batch short-circuits here and in SQL.
 */
async function reconcileBatchByReference(ref: string): Promise<ReconcileOutcome> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payment_batches")
    .select("id, status, amount, fee_amount, raw_payload")
    .eq("reference", ref)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { status: "not_found" };
    throw new Error(`batch read failed: ${error.message}`);
  }
  const batch = data as BatchRow | null;
  if (!batch) return { status: "not_found" };

  const engagementIds = await batchEngagementIds(batch.id);
  const firstEngagement = engagementIds[0] ?? "";

  if (batch.status === "paid") {
    return { status: "already_paid", engagementId: firstEngagement };
  }
  if (batch.status === "cancelled") {
    return { status: "refused", reason: "batch_cancelled" };
  }
  if (batch.status === "failed" && batch.raw_payload?.note) {
    // Paystack charged, the ledger refused — a refund to chase, not a retry.
    return { status: "refused", reason: "previously_refused" };
  }

  let txn: PaystackTransaction;
  try {
    txn = await verifyTransaction(ref);
  } catch (err) {
    if (!isReferenceNotFound(err)) throw err;
    await closeBatch(batch.id, "not_found");
    return { status: "refused", reason: "reference_not_found" };
  }
  if (txn.status !== "success") {
    if (txn.status === "abandoned" || txn.status === "failed") {
      await closeBatch(batch.id, txn.status);
    }
    return { status: "pending", paystackStatus: txn.status };
  }

  const courseAmount = pesewasFrom(batch.amount);
  const feeAmount = pesewasFrom(batch.fee_amount);
  const verifiedAmount = BigInt(txn.amount);
  if (verifiedAmount !== courseAmount + feeAmount) {
    return {
      status: "refused",
      reason: `amount_mismatch: expected ${courseAmount + feeAmount} (courses ${courseAmount} + fee ${feeAmount}), verified ${verifiedAmount}`,
    };
  }

  // A batch the sweep closed as abandoned can still be completed afterwards
  // (the student reopened the checkout page). Paystack now says it is paid,
  // so reopen it — and its items — for the apply.
  if (batch.status === "failed") {
    await supabase
      .from("payment_batches")
      .update({ status: "initialized", updated_at: new Date().toISOString() })
      .eq("id", batch.id)
      .eq("status", "failed");
    await supabase
      .from("payments")
      .update({ status: "initialized" })
      .eq("batch_id", batch.id)
      .eq("status", "failed");
  }

  const { error: applyError } = await supabase.rpc("payment_apply_verified_batch", {
    p_batch_id: batch.id,
    p_paystack_reference: ref,
    p_amount: courseAmount.toString(),
    p_currency: txn.currency,
    p_paystack_status: txn.status,
    p_raw: txn as unknown as object,
  });
  if (applyError) {
    // Webhook, return path and sweep can race on one batch; the loser sees a
    // lock-ordered refusal although the winner applied it.
    const { data: after } = await supabase
      .from("payment_batches")
      .select("status")
      .eq("id", batch.id)
      .maybeSingle();
    if ((after as { status?: string } | null)?.status === "paid") {
      return { status: "already_paid", engagementId: firstEngagement };
    }
    if (isDefinitiveRefusal(applyError.message)) {
      await closeBatch(
        batch.id,
        txn.status,
        `Paystack charged ${verifiedAmount} pesewas; the ledger refused it: ${applyError.message}`,
      );
    }
    return { status: "refused", reason: applyError.message };
  }

  // One text for the whole charge, deduped on the reference Paystack knows.
  await textPaymentReceived(firstEngagement, courseAmount, ref);
  // Group bookings become group seats — per agreement, idempotent.
  for (const engagementId of engagementIds) {
    await seatGroupBookingForEngagement(engagementId);
  }

  return {
    status: "applied",
    paymentId: batch.id,
    engagementId: firstEngagement,
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

  // Batch ITEM rows (`<ref>-B01`, 0040) are skipped: Paystack has never heard
  // of those references, so verifying them would close live items as
  // `not_found`. Their batch is swept below under the reference Paystack knows.
  const staleSingles = (excludeBatchItems: boolean) => {
    let query = supabase
      .from("payments")
      .select("paystack_reference")
      .eq("status", "initialized")
      .lt("created_at", cutoff);
    if (excludeBatchItems) query = query.is("batch_id", null);
    return query.order("created_at", { ascending: true }).limit(limit);
  };
  let { data, error } = await staleSingles(true);
  if (error && isMissingColumn(error)) ({ data, error } = await staleSingles(false));
  if (error) {
    console.error(`[payments] stale charge query failed: ${error.message}`);
    return { checked: 0, applied: 0 };
  }

  const references = (data ?? []).map(
    (raw) => (raw as { paystack_reference: string }).paystack_reference,
  );

  const { data: batches, error: batchError } = await supabase
    .from("payment_batches")
    .select("reference")
    .eq("status", "initialized")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (batchError) {
    // Pre-0040 database: no batches to sweep.
    if (!isMissingTable(batchError)) {
      console.error(`[payments] stale batch query failed: ${batchError.message}`);
    }
  } else {
    references.push(...(batches ?? []).map((b) => (b as { reference: string }).reference));
  }

  let applied = 0;
  let checked = 0;
  for (const reference of references) {
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
