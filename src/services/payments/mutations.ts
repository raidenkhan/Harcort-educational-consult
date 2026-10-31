"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/postgres";
import { APP_URL } from "@/lib/email/client";
import { requireProfile } from "@/services/auth/queries";
import type { Profile } from "@/types";
import { profileIsAdmin } from "@/lib/auth/admin";
import { scheduleOutboxDrain } from "@/lib/email/outbox";
import {
  PaystackApiError,
  createTransferRecipient,
  initializeTransaction,
  isPaystackConfigured,
} from "./paystack";
import { formatGhs } from "@/lib/money";
import {
  cancelPaymentRequestSchema,
  createEngagementSchema,
  createPaymentRequestSchema,
  initializeInstallmentPaymentSchema,
  openPlanSchema,
  payPaymentRequestSchema,
  recordPartPaymentSchema,
  savePayoutAccountSchema,
  setPaymentPromiseSchema,
} from "./schemas";
import { generatePaymentToken, hashPaymentToken, paymentLinkPath } from "./links";
import { checkoutTotal } from "./fees";
import { getPaymentLinkByToken } from "./queries";

/**
 * Payment mutations — the write side of the payments domain.
 *
 * Security model (same contract as every other service): the actor is
 * re-derived server-side from the session cookie; amounts are NEVER taken
 * from the client (the DB RPCs re-derive from the engagement snapshot);
 * state-changing money transitions run through Postgres RPCs whose guards
 * cannot be routed around (see supabase/migrations/0011_payments.sql).
 *
 * Note: "use server" files may only export async functions, so state objects
 * carry any extra fields (like checkoutUrl) inside the returned object.
 */

export type PaymentFormState = {
  error?: string;
  message?: string;
  checkoutUrl?: string;
  /** 0032 — `/pay/<token>` for a freshly issued part-payment link. The client
   *  prefixes the current origin (the console works on localhost and prod). */
  linkPath?: string;
};

/**
 * How long a hosted checkout page stays reusable for the same payer and
 * amount. Long enough to absorb a double-click or a page refresh, short enough
 * that Paystack's access code has not expired. See the guard in `runCheckout`.
 */
const CHECKOUT_REUSE_MS = 10 * 60 * 1000;

/** PostgREST RPC errors carry the Postgres message we raised. */
function rpcError(err: { message?: string } | Error | null): string {
  const message = err instanceof Error ? err.message : (err?.message ?? "Payment action failed");
  return message.replace(/^.*?(?=(forbidden|amount_mismatch|amount_exceeds_outstanding|currency_mismatch|installment_not_payable|installment_not_found|engagement_exists|engagement_not_found|engagement_cancelled|sessions_incomplete|payments_outstanding|payout_account_unverified|payout_account_not_found|payout_exists|payout_not_found|payout_not_approvable|payout_not_cancellable|payout_not_holdable|payout_not_releasable|reason_required|not_completable|service_not_found|service_not_available|format_not_offered|invalid_price|invalid_token|payment_request_not_found|payment_request_not_open))/, "").replace(/\s+/g, " ").trim();
}

/** Human-friendly copy for the Postgres guard messages. */
function friendlyError(error: string): string {
  if (error.startsWith("engagement_exists")) {
    return "You already have an open agreement for this course.";
  }
  if (error.startsWith("service_not_available") || error.startsWith("service_not_found")) {
    return "That course offer is no longer available.";
  }
  if (error.startsWith("format_not_offered")) {
    return "That tutor doesn't teach this course in the session format you picked — choose the other format.";
  }
  if (error.startsWith("invalid_price")) {
    return "That course offer has no usable price — ask the tutor to update it.";
  }
  if (error.startsWith("payment_request_not_found")) {
    return "That payment link no longer exists.";
  }
  if (error.startsWith("payment_request_not_open")) {
    return "That payment link is no longer open — it was already paid or cancelled.";
  }
  if (error.startsWith("invalid_token")) {
    return "That payment link is not valid.";
  }
  if (error.startsWith("forbidden")) return "You're not allowed to do that.";
  if (error.startsWith("payout_account_unverified")) {
    return "Add and verify your mobile money account before requesting a payout.";
  }
  if (error.startsWith("payout_account_not_found")) {
    return "That tutor hasn't saved a payout account yet.";
  }
  if (error.startsWith("payout_not_cancellable")) {
    return "That payout can no longer be marked failed (wrong state).";
  }
  if (error.startsWith("payments_outstanding")) {
    return "Some installments are still unpaid — collect every payment first.";
  }
  if (error.startsWith("sessions_incomplete")) {
    return "Attendance isn't fully confirmed yet — both tutor and student must tick every session.";
  }
  if (error.startsWith("reason_required")) return "A reason is required.";
  if (error.startsWith("amount_mismatch")) {
    return "Payment amount doesn't match the agreement — contact support.";
  }
  if (error.startsWith("amount_exceeds_outstanding")) {
    return "That amount is more than the outstanding balance on this agreement.";
  }
  // The RPC raises these as bare tokens. Never let `installment_not_found`
  // (or any other machine word) reach a student's screen.
  if (error.startsWith("installment_not_found")) {
    return "We couldn't match that payment to your agreement. Refresh and try again — if you've already paid, contact the admin team.";
  }
  if (error.startsWith("installment_not_payable")) {
    return "That installment is already settled — refresh to see your updated balance.";
  }
  if (error.startsWith("engagement_not_found")) {
    return "We couldn't find that payment agreement. Refresh and try again.";
  }
  if (error.startsWith("currency_mismatch")) {
    return "That payment's currency doesn't match the agreement — contact the admin team.";
  }
  return error;
}

// ---------------------------------------------------------------------------
// Engagement creation (student commits to a quoted course)
// ---------------------------------------------------------------------------

export async function createEngagement(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();

  const parsed = createEngagementSchema.safeParse({
    tutorServiceId: formData.get("tutorServiceId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("create_payment_engagement", {
    actor_id: profile.id,
    p_student_id: profile.id,
    p_tutor_service_id: parsed.data.tutorServiceId,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  const engagementId = typeof data === "string" ? data : null;
  if (!engagementId) return { error: "Could not create the payment agreement." };

  scheduleOutboxDrain();
  revalidatePath("/dashboard");
  revalidatePath("/admin", "layout");
  return {
    message:
      "Agreement created — pay the semester fee in full to activate your sessions.",
  };
}

// ---------------------------------------------------------------------------
// Checkout initiation (Paystack)
// ---------------------------------------------------------------------------

/**
 * Shared checkout pipeline: ownership check, payability check, Paystack
 * init. Returns checkoutUrl for the client to redirect to. The payments row
 * is created here as 'initialized' and flipped to 'paid' only after Paystack
 * confirms the charge — by the webhook, by `/api/payments/return` when the
 * browser comes back, or by the cron sweep. The callback redirect is never
 * itself proof of payment: every path re-verifies with Paystack first.
 *
 * The amount charged is the installment's OUTSTANDING balance, not its face
 * value: after a part payment (0029) the installment stays 'pending' with
 * `paid_amount` > 0, and charging the full amount again would be rejected by
 * the webhook as an overpay. A part-payment link (0032) overrides it with an
 * amount the admin already approved — still server-derived, never from the
 * client.
 *
 * Two failure modes are handled here rather than left to the caller: a repeat
 * submit reuses the checkout page minted moments ago (see the guard below),
 * and a Paystack call whose outcome we never saw leaves the row 'initialized'
 * so the return path and the sweep can still verify it.
 */
async function runCheckout(
  profile: Pick<Profile, "id">,
  engagementId: string,
  installmentId: string,
  opts: {
    /** Charge this amount instead of the installment's outstanding balance. */
    amountPesewas?: number;
    /** The 0032 link this charge settles. */
    paymentRequestId?: string;
    /** Where Paystack returns the student. */
    returnPath?: string;
  } = {},
): Promise<PaymentFormState> {
  if (!isPaystackConfigured()) {
    return { error: "Payments are not configured yet — please try again later." };
  }

  const supabase = createAdminClient();

  // Ownership: the caller must be the engagement's student.
  // `currency` lives on the ENGAGEMENT, not the installment (0011) — reading it
  // from installments made every checkout fail with a 42703 that surfaced as
  // "Installment not found."
  const { data: engagement, error: engError } = await supabase
    .from("engagements")
    .select("id, student_id, status, currency")
    .eq("id", engagementId)
    .maybeSingle();
  if (engError || !engagement) return { error: "Agreement not found." };
  const eng = engagement as {
    id: string;
    student_id: string;
    status: string;
    currency: string;
  };
  if (eng.student_id !== profile.id) return { error: "forbidden: not your agreement" };
  if (eng.status === "cancelled") return { error: "This agreement was cancelled." };

  // The installment must belong to the engagement and still be payable.
  // `paid_amount` (0029) is read separately so a pre-0029 database still
  // checks out — there, a payable installment has nothing paid against it.
  const readInstallment = (withPartial: boolean) => {
    const columns = withPartial
      ? "id, amount, status, idx, paid_amount"
      : "id, amount, status, idx";
    return supabase
      .from("installments")
      .select(columns)
      .eq("id", installmentId)
      .eq("engagement_id", engagementId)
      .maybeSingle();
  };

  const firstRead = await readInstallment(true);
  let installment = firstRead.data;
  let instError = firstRead.error;
  if (instError && isMissingColumn(instError)) {
    const retry = await readInstallment(false);
    installment = retry.data;
    instError = retry.error;
  }
  if (instError) {
    // A failed READ is not a missing installment — say so, or the next schema
    // drift hides behind a misleading message again.
    return { error: "Could not load this payment — please refresh and try again." };
  }
  if (!installment) return { error: "Installment not found." };

  const inst = installment as unknown as {
    id: string;
    amount: string | number;
    paid_amount?: string | number | null;
    status: string;
    idx: number;
  };
  if (inst.status !== "pending" && inst.status !== "overdue") {
    return { error: `This installment is already ${inst.status}.` };
  }

  const outstanding = Number(inst.amount) - Number(inst.paid_amount ?? 0);
  if (outstanding <= 0) {
    return { message: "This agreement is already fully paid." };
  }

  const amount = opts.amountPesewas ?? outstanding;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter an amount above zero." };
  }
  if (amount > outstanding) {
    return { error: "That amount is more than the outstanding balance." };
  }

  /**
   * Double-tap guard.
   *
   * "Pay now" is a server action that mints a Paystack reference and redirects.
   * Two taps (or a slow response and an impatient second tap) used to mint two
   * live references against the same installment: the ledger refuses the
   * second apply as an overpay, but Paystack had already taken the money. A
   * row we created for this exact payer/agreement/installment/amount in the
   * last ten minutes already has a hosted checkout page — send the student
   * back to it instead of minting another. Only 'initialized' rows match, so a
   * paid or failed attempt is never reused, and ten minutes is short enough
   * that Paystack's access code is still live.
   */
  const readRecentCheckout = (withLinkColumn: boolean) =>
    supabase
      .from("payments")
      .select(
        withLinkColumn
          ? "id, raw_payload, payment_request_id"
          : "id, raw_payload",
      )
      .eq("engagement_id", engagementId)
      .eq("installment_id", installmentId)
      .eq("initialized_by", profile.id)
      .eq("status", "initialized")
      .eq("amount", String(amount))
      .gte("created_at", new Date(Date.now() - CHECKOUT_REUSE_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(5);

  type RecentCheckout = {
    id: string;
    raw_payload?: { checkout_url?: unknown } | null;
    payment_request_id?: string | null;
  };

  const recent = await readRecentCheckout(true);
  let recentRows = recent.data as RecentCheckout[] | null;
  if (recent.error && isMissingColumn(recent.error)) {
    // Pre-0032 database: no `payment_request_id` to filter on. Every row is a
    // dashboard checkout, so the link comparison below is a no-op.
    const retry = await readRecentCheckout(false);
    recentRows = retry.data as RecentCheckout[] | null;
  }
  // A failed reuse READ must never block a checkout — it only costs us the
  // guard for this attempt.
  const reusable = (recentRows ?? []).find((row) => {
    const url = row.raw_payload?.checkout_url;
    return (
      typeof url === "string" &&
      url.startsWith("https://") &&
      (row.payment_request_id ?? null) === (opts.paymentRequestId ?? null)
    );
  });
  if (reusable) {
    return {
      message: "Redirecting to Paystack…",
      checkoutUrl: (reusable.raw_payload as { checkout_url: string }).checkout_url,
    };
  }

  // The student's email lives in credentials (self-hosted auth).
  const { data: cred } = await supabase
    .from("credentials")
    .select("email")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const email = (cred as { email: string } | null)?.email;
  if (!email) return { error: "Your account has no email on file." };

  // A stable per-attempt reference ties the Paystack charge to our rows.
  const reference = `HARC-${installmentId.slice(0, 8)}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;

  /**
   * Paystack's processing fee is passed to the student (0034): the charge is
   * `amount + fee`, Paystack keeps its fee, and the agreement receives exactly
   * `amount` — so tutor earnings, payouts and the 0029 amount guards keep
   * working on the net figure.
   *
   * The fee is computed HERE, server-side, from the published schedule
   * (env-tunable, see fees.ts) and stored on the payment row. The webhook then
   * verifies the gross charge against `amount + fee_amount` instead of
   * re-deriving it from a config that may have changed since checkout.
   *
   * A database that hasn't applied 0034 has no `fee_amount` column. Rather
   * than break checkout, fall back to absorbing the fee (charge = net), which
   * is exactly the pre-0034 behaviour the webhook expects.
   */
  const checkout = checkoutTotal(BigInt(amount));
  const paymentRow = {
    engagement_id: engagementId,
    installment_id: installmentId,
    amount: String(amount), // BIGINT as string — BigInt breaks JSON.stringify
    currency: eng.currency,
    paystack_reference: reference,
    status: "initialized",
    initialized_by: profile.id,
    // Only written by the 0032 link path, so a pre-0032 database never
    // sees an unknown column.
    ...(opts.paymentRequestId
      ? { payment_request_id: opts.paymentRequestId }
      : {}),
  };

  const insertPayment = (withFee: boolean) =>
    supabase
      .from("payments")
      .insert({
        ...paymentRow,
        // Spread rather than a literal property: `fee_amount` is 0034, and the
        // client's row type does not know it yet. Spread properties are exempt
        // from TS excess-property checks, so this compiles before the types are
        // regenerated — the same trick `payment_request_id` already uses.
        ...(withFee ? { fee_amount: checkout.feePesewas.toString() } : {}),
      })
      .select("id")
      .single();

  let inserted = await insertPayment(true);
  let feePesewas = checkout.feePesewas;
  if (inserted.error && isMissingColumn(inserted.error)) {
    // Pre-0034 database: absorb the fee so the stored row and the Paystack
    // charge still agree (the webhook's expected gross is amount + 0).
    feePesewas = BigInt(0);
    inserted = await insertPayment(false);
  }
  if (inserted.error) {
    return { error: `Could not start checkout: ${inserted.error.message}` };
  }
  const init = inserted.data as { id: string };
  const chargePesewas = BigInt(amount) + feePesewas;

  try {
    const txn = await initializeTransaction({
      email,
      amountPesewas: Number(chargePesewas), // pesewas — server-derived
      reference,
      callbackUrl: `${APP_URL}/api/payments/return?next=${encodeURIComponent(
        opts.returnPath ?? "/dashboard?payment=return",
      )}`,
      metadata: {
        engagement_id: engagementId,
        installment_id: installmentId,
        installment_idx: inst.idx,
        // What the ledger applies vs what the student is charged — useful
        // when reconciling a charge in the Paystack dashboard.
        course_amount: amount,
        service_fee: Number(feePesewas),
        ...(opts.paymentRequestId
          ? { payment_request_id: opts.paymentRequestId }
          : {}),
      },
    });

    // Paystack returns the hosted page and its access code. Without a URL
    // there is nothing to redirect to — but the transaction may still exist,
    // so this is NOT a definitive rejection and the row stays 'initialized'.
    if (!txn.authorization_url) {
      throw new Error(
        "Paystack didn't return a checkout link — please try again in a moment.",
      );
    }

    // Remember the page on the row itself: a second tap within the reuse
    // window is sent back to it instead of minting another live reference.
    // Best-effort — the student can still pay if this write fails, they just
    // lose the double-tap guard for this attempt. (The apply RPC overwrites
    // `raw_payload` with the verify response, so this never outlives the
    // charge.)
    const { error: rememberError } = await supabase
      .from("payments")
      .update({
        raw_payload: {
          checkout_url: txn.authorization_url,
          access_code: txn.access_code ?? null,
        },
      })
      .eq("id", init.id);
    if (rememberError) {
      console.error(
        `[payments] could not store the checkout URL for ${reference}: ${rememberError.message}`,
      );
    }

    return { message: "Redirecting to Paystack…", checkoutUrl: txn.authorization_url };
  } catch (err) {
    // Only an answer from Paystack can prove no transaction was created. A
    // timeout, a dropped connection or an HTML gateway page leaves the
    // outcome UNKNOWN: the transaction may exist, so the row must stay
    // 'initialized' for `/api/payments/return` and the sweep to verify.
    // Marking it 'failed' here — the old behaviour — hid real charges from
    // every reconciliation path.
    if (err instanceof PaystackApiError) {
      await supabase
        .from("payments")
        .update({ status: "failed" })
        .eq("id", init.id);
      return { error: err.message };
    }
    console.error(`[payments] checkout ${reference}: outcome unknown`, err);
    return {
      error:
        "We couldn't reach Paystack to start this payment. Nothing has been charged — please try again in a moment.",
    };
  }
}

/**
 * Student starts Paystack checkout for one installment (dashboard path).
 */
export async function initializeInstallmentPayment(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();

  const parsed = initializeInstallmentPaymentSchema.safeParse({
    engagementId: formData.get("engagementId"),
    installmentId: formData.get("installmentId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  return runCheckout(profile, parsed.data.engagementId, parsed.data.installmentId);
}

/**
 * One-click pay from the request paywall: creates (or re-enters) the payment
 * agreement for the quoted course, then goes straight to Paystack for the
 * full semester fee (0029 — 100% upfront). The request may still be pending
 * (0024 — pay to activate, the tutor accepts to schedule); a declined request
 * closed the paywall instead. Reuses an existing open engagement so tapping
 * twice never blocks.
 */
export async function commitAndStartCheckout(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();

  const parsed = createEngagementSchema.safeParse({
    tutorServiceId: formData.get("tutorServiceId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }
  if (!isPaystackConfigured()) {
    return { error: "Payments are not configured yet — please try again later." };
  }

  const supabase = createAdminClient();

  // Gate: there must be a live request from this student to this tutor. As of
  // 0024 the paywall opens the moment the request is sent — payment no longer
  // waits for acceptance — so a pending request is enough. Acceptance still
  // governs scheduling; a declined request falls out of this filter.
  const { data: service } = await supabase
    .from("tutor_services")
    .select("id, tutor_profile_id")
    .eq("id", parsed.data.tutorServiceId)
    .maybeSingle();
  if (!service) return { error: "That course offer is no longer available." };
  const tutorProfileId = (service as { tutor_profile_id: string }).tutor_profile_id;

  const { data: request } = await supabase
    .from("tutor_requests")
    .select("id")
    .eq("student_id", profile.id)
    .eq("tutor_profile_id", tutorProfileId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!request) {
    return {
      error: "Send a tutor request first — the payment wall opens once it's sent.",
    };
  }
  const requestId = (request as { id: string }).id;

  const { data: created, error } = await supabase.rpc("create_payment_engagement", {
    actor_id: profile.id,
    p_student_id: profile.id,
    p_tutor_service_id: parsed.data.tutorServiceId,
    p_request_id: requestId,
  });

  let engagementId: string | null = typeof created === "string" ? created : null;
  if (error) {
    if (!/engagement_exists/.test(error.message ?? "")) {
      return { error: friendlyError(rpcError(error)) };
    }
    // Already committed — find the open agreement and continue to payment.
    const { data: existing } = await supabase
      .from("engagements")
      .select("id")
      .eq("student_id", profile.id)
      .eq("tutor_service_id", parsed.data.tutorServiceId)
      .in("status", ["pending_payment", "active"])
      .maybeSingle();
    if (!existing) return { error: friendlyError(rpcError(error)) };
    engagementId = (existing as { id: string }).id;
  }
  if (!engagementId) return { error: "Could not create the payment agreement." };

  // First payable installment (idx order) — #1, the full semester fee.
  const { data: instRows } = await supabase
    .from("installments")
    .select("id, idx, status")
    .eq("engagement_id", engagementId)
    .order("idx");
  const payable = (instRows as Array<{ id: string; idx: number; status: string }> | null)?.find(
    (r) => r.status === "pending" || r.status === "overdue",
  );
  if (!payable) {
    return { message: "This agreement is already fully paid." };
  }

  return runCheckout(profile, engagementId, payable.id);
}

// ---------------------------------------------------------------------------
// Admin-recorded part payments (0029 — money collected outside Paystack)
// ---------------------------------------------------------------------------

/**
 * Admin records a payment a student made OUT OF BAND (cash, personal MoMo,
 * bank transfer to the admin) against their agreement. The student pays the
 * admin — never the tutor — so the ledger row carries a synthetic ADMIN-
 * reference and the agreement (and through it the tutor's earnings) sees the
 * money exactly like a Paystack payment. Recording one also activates the
 * engagement: it IS the admin approving the plan.
 */
export async function recordPartPayment(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "Only admins can record payments." };
  }

  const parsed = recordPartPaymentSchema.safeParse({
    engagementId: formData.get("engagementId"),
    amountCedis: formData.get("amountCedis"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const amountPesewas = Math.round(parsed.data.amountCedis * 100);
  if (amountPesewas <= 0) return { error: "Enter an amount above zero." };

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("admin_record_part_payment", {
    actor_id: profile.id,
    p_engagement_id: parsed.data.engagementId,
    p_amount: amountPesewas,
    p_note: parsed.data.note ?? null,
  });
  if (error) return { error: friendlyError(rpcError(error)) };
  void data;

  scheduleOutboxDrain();
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/tutor", "layout");
  return {
    message: `Recorded ${formatGhs(BigInt(amountPesewas))} — applied to the agreement.`,
  };
}

// ---------------------------------------------------------------------------
// Payment plans & part-payment links (0032)
// ---------------------------------------------------------------------------

/**
 * Admin opens a plan for a student who hit the paywall and asked for help.
 *
 * The queue row is a tutor REQUEST — there is no agreement yet, and without
 * one there is nothing to record a part payment against. `create_payment_
 * engagement` accepts an admin actor, so this creates the agreement (with the
 * full semester fee as its single installment) on the student's behalf; the
 * admin can then set a promised date and issue a part-payment link. Re-running
 * it is harmless: `engagement_exists` means the plan is already open.
 */
export async function openPaymentPlan(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "Only admins can open a payment plan." };
  }

  const parsed = openPlanSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = createAdminClient();

  const { data: request } = await supabase
    .from("tutor_requests")
    .select("id, student_id, course_id, tutor_profile_id, status")
    .eq("id", parsed.data.requestId)
    .maybeSingle();
  if (!request) return { error: "That request no longer exists." };

  const req = request as {
    id: string;
    student_id: string;
    course_id: string | null;
    tutor_profile_id: string;
    status: string;
  };
  if (req.status !== "pending" && req.status !== "accepted") {
    return { error: "That request is closed — ask the student to send a new one." };
  }
  if (!req.course_id) {
    return { error: "That request has no course attached." };
  }

  const { data: service } = await supabase
    .from("tutor_services")
    .select("id")
    .eq("tutor_profile_id", req.tutor_profile_id)
    .eq("course_id", req.course_id)
    .maybeSingle();
  if (!service) {
    return { error: "That tutor no longer offers this course." };
  }

  const { error } = await supabase.rpc("create_payment_engagement", {
    actor_id: profile.id,
    p_student_id: req.student_id,
    p_tutor_service_id: (service as { id: string }).id,
    p_request_id: req.id,
  });
  // `engagement_exists` is success here: the plan is already open, and the
  // admin is about to add a link to it.
  if (error && !/engagement_exists/.test(error.message ?? "")) {
    return { error: friendlyError(rpcError(error)) };
  }

  scheduleOutboxDrain();
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/tutor", "layout");
  return {
    message:
      "Plan opened. Set the date the balance will be settled, then send the student a part-payment link.",
  };
}

/**
 * Record (or move, or clear) the agreed date the balance will be settled.
 * The student sees it on the paywall, and the console flags an overdue
 * promise — a plan without a date is a plan nobody is tracking.
 */
export async function setPaymentPromise(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "Only admins can set a payment promise." };
  }

  const parsed = setPaymentPromiseSchema.safeParse({
    engagementId: formData.get("engagementId"),
    date: String(formData.get("date") ?? "").trim() || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid date" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_set_payment_promise", {
    actor_id: profile.id,
    p_engagement_id: parsed.data.engagementId,
    p_date: parsed.data.date ?? null,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard");
  return {
    message: parsed.data.date
      ? "Promised date saved."
      : "Promised date cleared.",
  };
}

/**
 * Issue a single-use part-payment link for a specific amount.
 *
 * The raw token is generated here and never stored — only its SHA-256 hash
 * reaches Postgres (same rule as sessions and reset codes). The RPC re-checks
 * the amount against the live outstanding balance under a row lock, so an
 * admin cannot issue a link for more than the student owes.
 */
export async function createPaymentRequest(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "Only admins can create payment links." };
  }

  const parsed = createPaymentRequestSchema.safeParse({
    engagementId: formData.get("engagementId"),
    amountCedis: formData.get("amountCedis"),
    note: formData.get("note") || undefined,
    validDays: formData.get("validDays") || 7,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const amountPesewas = Math.round(parsed.data.amountCedis * 100);
  if (amountPesewas <= 0) return { error: "Enter an amount above zero." };

  const token = generatePaymentToken();
  const expiresAt = new Date(
    Date.now() + parsed.data.validDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_create_payment_request", {
    actor_id: profile.id,
    p_engagement_id: parsed.data.engagementId,
    p_token_hash: hashPaymentToken(token),
    p_amount: amountPesewas,
    p_note: parsed.data.note ?? null,
    p_expires_at: expiresAt,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  revalidatePath("/admin", "layout");
  return {
    message: `Link ready for ${formatGhs(BigInt(amountPesewas))} — copy it and send it to the student.`,
    linkPath: paymentLinkPath(token),
  };
}

/** Cancel an open link. A paid link is immutable: the money row is the record. */
export async function cancelPaymentRequest(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "Only admins can cancel payment links." };
  }

  const parsed = cancelPaymentRequestSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid link" };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_cancel_payment_request", {
    actor_id: profile.id,
    p_payment_request: parsed.data.requestId,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  revalidatePath("/admin", "layout");
  return { message: "Link cancelled." };
}

/**
 * The student pays an admin-issued link (`/pay/[token]`).
 *
 * The token is the whole credential: it resolves to ONE link, which names the
 * agreement and the amount the admin approved. Everything money-related is
 * re-derived server-side — the client only ever sends the token. The charge
 * is capped at the live outstanding balance so a stale link can never overpay
 * an agreement that has since been part-paid.
 */
export async function payPaymentRequest(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();

  const parsed = payPaymentRequestSchema.safeParse({
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "This payment link is not valid." };
  }

  const link = await getPaymentLinkByToken(parsed.data.token, Date.now());
  if (!link) return { error: "This payment link is not valid." };
  if (link.studentId && link.studentId !== profile.id) {
    return { error: "This payment link was issued to another student." };
  }

  if (link.status === "paid") {
    return { message: "This link has already been paid — thank you." };
  }
  if (link.status === "cancelled") {
    return { error: "This link was cancelled — ask the admin team for a new one." };
  }
  if (link.remainingPesewas <= BigInt(0)) {
    return { message: "This agreement is already fully paid." };
  }
  if (!link.payable) {
    return { error: "This payment link has expired — ask the admin team for a new one." };
  }

  const supabase = createAdminClient();
  const { data: installmentRows } = await supabase
    .from("installments")
    .select("id, idx, status")
    .eq("engagement_id", link.engagementId)
    .order("idx");
  const payable = (
    installmentRows as Array<{ id: string; idx: number; status: string }> | null
  )?.find((row) => row.status === "pending" || row.status === "overdue");
  if (!payable) return { message: "This agreement is already fully paid." };

  const charge =
    link.amount > link.remainingPesewas ? link.remainingPesewas : link.amount;

  return runCheckout(profile, link.engagementId, payable.id, {
    amountPesewas: Number(charge),
    paymentRequestId: link.id,
    returnPath: `${paymentLinkPath(parsed.data.token)}?payment=return`,
  });
}

// ---------------------------------------------------------------------------
// Tutor payout account
// ---------------------------------------------------------------------------

/** Tutor saves (or replaces) their MoMo payout account. */
export async function savePayoutAccount(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor") {
    return { error: "Only tutors can set up payouts." };
  }

  const parsed = savePayoutAccountSchema.safeParse({
    provider: formData.get("provider"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request" };
  }

  const supabase = createAdminClient();

  // Must own an approved tutor profile.
  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id, verification_status")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (
    !tutorProfile ||
    (tutorProfile as { verification_status: string }).verification_status !== "approved"
  ) {
    return { error: "Your tutor profile must be approved before setting up payouts." };
  }
  const tutorProfileId = (tutorProfile as { id: string }).id;

  const rawName = String(formData.get("accountName") ?? "").trim();
  const accountName = rawName.length >= 3 ? rawName.slice(0, 120) : profile.full_name;

  // Normalise the phone to Paystack's expected local format (0XXXXXXXXX).
  let phone = parsed.data.phone.replace(/[^0-9+]/g, "");
  if (phone.startsWith("+233")) phone = `0${phone.slice(4)}`;
  else if (phone.startsWith("233")) phone = `0${phone.slice(3)}`;

  if (!isPaystackConfigured()) {
    // Save locally; recipient creation (and verification) happens when the
    // platform is configured — the account stays unverified meanwhile.
    const { error } = await supabase.from("tutor_payout_accounts").upsert(
      {
        tutor_profile_id: tutorProfileId,
        provider: parsed.data.provider,
        phone,
        account_name: accountName,
        recipient_code: null,
        verified_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tutor_profile_id" },
    );
    if (error) return { error: `Could not save the account: ${error.message}` };
    revalidatePath("/tutor", "layout");
    return {
      message: "Saved. Payout verification will complete once payments go live.",
    };
  }

  // Create the Paystack transfer recipient now (unverified until the ₵1 ping
  // transfer lands — verification is an admin/manual step in v1).
  let recipientCode: string | null = null;
  try {
    const recipient = await createTransferRecipient({
      accountName,
      phone,
      provider: parsed.data.provider,
    });
    recipientCode = recipient.recipient_code;
  } catch (err) {
    return {
      error: `Paystack rejected the account: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }

  const { error } = await supabase.from("tutor_payout_accounts").upsert(
    {
      tutor_profile_id: tutorProfileId,
      provider: parsed.data.provider,
      phone,
      account_name: accountName,
      recipient_code: recipientCode,
      verified_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tutor_profile_id" },
  );
  if (error) return { error: `Could not save the account: ${error.message}` };

  revalidatePath("/tutor", "layout");
  return { message: "Mobile money account saved. It will be verified before your first payout." };
}

// ---------------------------------------------------------------------------
// Tutor payout request
// ---------------------------------------------------------------------------

/** The tutor requests their payout — every 0011 guard applies. */
export async function requestPayout(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();

  const engagementId = String(formData.get("engagementId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(engagementId)) {
    return { error: "Invalid engagement." };
  }

  const supabase = createAdminClient();

  // The RPC re-verifies tutor identity + all money guards; the actor must be
  // the engagement's own tutor or an admin.
  const { error } = await supabase.rpc("request_payout", {
    actor_id: profile.id,
    p_engagement_id: engagementId,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/tutor", "layout");
  revalidatePath("/admin", "layout");
  return {
    message:
      "Payout requested. Clean completions release automatically; flagged ones go to the admin queue.",
  };
}

// ---------------------------------------------------------------------------
// Admin payout workflow
// ---------------------------------------------------------------------------

export async function adminReleasePayout(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "forbidden: admin only" };
  }

  const payoutId = String(formData.get("payoutId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(payoutId)) return { error: "Invalid payout." };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_release_payout", {
    actor_id: profile.id,
    p_payout_id: payoutId,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/admin", "layout");
  return { message: "Payout approved — the transfer can proceed." };
}

export async function adminHoldPayout(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "forbidden: admin only" };
  }

  const payoutId = String(formData.get("payoutId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!/^[0-9a-f-]{36}$/i.test(payoutId)) return { error: "Invalid payout." };
  if (!reason) return { error: "A reason is required." };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_hold_payout", {
    actor_id: profile.id,
    p_payout_id: payoutId,
    p_reason: reason,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/admin", "layout");
  return { message: "Payout held." };
}

/**
 * Execute an approved payout via Paystack. Called by the admin from the
 * payout queue. The payout must be in 'approved'.
 *
 * Reconciliation contract: initiating the transfer does NOT mean the tutor
 * has been paid — MoMo transfers are async. The transfer_code is recorded
 * and the payout moves approved → 'transferring'; the webhook
 * (transfer.success / transfer.failed) or the sweep's requery finalizes it.
 */
export async function adminExecutePayout(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "forbidden: admin only" };
  }

  const payoutId = String(formData.get("payoutId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(payoutId)) return { error: "Invalid payout." };

  if (!isPaystackConfigured()) {
    return { error: "Payments are not configured yet — transfers unavailable." };
  }

  const supabase = createAdminClient();

  const { data: payout, error: fetchError } = await supabase
    .from("payouts")
    .select("id, status, amount, recipient_code, engagement_id")
    .eq("id", payoutId)
    .maybeSingle();
  if (fetchError || !payout) return { error: "Payout not found." };
  const p = payout as {
    id: string;
    status: string;
    amount: string | number;
    recipient_code: string | null;
    engagement_id: string;
  };
  if (p.status !== "approved") {
    return { error: `Payout is ${p.status} — approve it first.` };
  }
  if (!p.recipient_code) {
    return { error: "The tutor's payout account has no verified recipient code." };
  }

  const transferCode = `HRC-PAY-${randomUUID().slice(0, 12).toUpperCase()}`;
  let paystackTransferCode = transferCode;
  try {
    const { initiateTransfer } = await import("./paystack");
    const transfer = await initiateTransfer({
      amountPesewas: Number(p.amount),
      recipientCode: p.recipient_code,
      reason: `Harcourt tutor payout ${transferCode}`,
      reference: transferCode,
    });
    if (transfer.status === "failed") {
      return { error: "Paystack rejected the transfer — check the dashboard." };
    }
    // Store PAYSTACK's transfer_code (TRF_…), not our reference: the webhook's
    // transfer.* events are keyed by it, so reconciliation looks the payout
    // up by this column.
    if (transfer.transfer_code) paystackTransferCode = transfer.transfer_code;
  } catch (err) {
    if (err instanceof PaystackApiError) {
      // Paystack answered and refused the transfer: no transfer exists, the
      // payout stays 'approved', and the admin can fix the cause and retry.
      return { error: `Transfer failed: ${err.message}` };
    }

    // UNKNOWN outcome — a timeout, a dropped connection or a non-JSON gateway
    // page. The transfer may exist at Paystack, so the payout must not stay
    // payable: recording our own reference moves it approved → 'transferring'
    // (the sweep verifies a transfer by code OR reference) and a second click
    // can no longer send the tutor a second real payment. This is the payout
    // twin of the checkout rule: only an answer from Paystack proves nothing
    // happened.
    console.error(`[payments] payout ${payoutId}: transfer outcome unknown`, err);
    const { error: recordError } = await supabase.rpc("payment_record_transfer", {
      p_actor_id: profile.id,
      p_payout_id: payoutId,
      p_transfer_code: transferCode,
    });
    if (recordError) {
      console.error(
        `[payments] payout ${payoutId}: unknown outcome AND could not record it: ${recordError.message}`,
      );
      return {
        error:
          "Paystack didn't confirm the transfer and we couldn't record it. Check the Paystack dashboard before trying again — the tutor may already have been paid.",
      };
    }
    revalidatePath("/admin", "layout");
    revalidatePath("/tutor", "layout");
    return {
      message:
        "Paystack didn't confirm the transfer, so it is marked in flight. It finalizes automatically when Paystack reports — do not pay this payout again.",
    };
  }

  // Record the in-flight transfer: approved → 'transferring'. The webhook or
  // the sweep's requery finalizes paid/failed — never trust the init response
  // as proof of payment.
  const { error } = await supabase.rpc("payment_record_transfer", {
    p_actor_id: profile.id,
    p_payout_id: payoutId,
    p_transfer_code: paystackTransferCode,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/admin", "layout");
  revalidatePath("/tutor", "layout");
  return { message: "Transfer initiated — it finalizes when Paystack confirms." };
}

// ---------------------------------------------------------------------------
// Admin payout-account verification (0015)
// ---------------------------------------------------------------------------

/**
 * Admin verifies a tutor's saved MoMo payout account (sets verified_at).
 * The v1 ₵1 ping-transfer check is a manual/admin step — until the account
 * is verified, request_payout refuses with payout_account_unverified. The
 * RPC re-checks admin privilege, is idempotent, and writes the audit log.
 */
export async function adminSetPayoutAccountVerified(
  _prev: PaymentFormState,
  formData: FormData,
): Promise<PaymentFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "forbidden: admin only" };
  }

  const tutorProfileId = String(formData.get("tutorProfileId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(tutorProfileId)) {
    return { error: "Invalid tutor." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_verify_payout_account", {
    actor_id: profile.id,
    p_tutor_profile_id: tutorProfileId,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/admin", "layout");
  revalidatePath("/tutor", "layout");
  return { message: "Payout account verified — the tutor can now request payouts." };
}
