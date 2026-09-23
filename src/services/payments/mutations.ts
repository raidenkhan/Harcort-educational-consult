"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/email/client";
import { requireProfile } from "@/services/auth/queries";
import type { Profile } from "@/types";
import { profileIsAdmin } from "@/lib/auth/admin";
import { scheduleOutboxDrain } from "@/lib/email/outbox";
import { createTransferRecipient, initializeTransaction, isPaystackConfigured } from "./paystack";
import {
  createEngagementSchema,
  initializeInstallmentPaymentSchema,
  savePayoutAccountSchema,
} from "./schemas";

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

export type PaymentFormState = { error?: string; message?: string; checkoutUrl?: string };

/** PostgREST RPC errors carry the Postgres message we raised. */
function rpcError(err: { message?: string } | Error | null): string {
  const message = err instanceof Error ? err.message : (err?.message ?? "Payment action failed");
  return message.replace(/^.*?(?=(forbidden|amount_mismatch|currency_mismatch|installment_not_payable|installment_not_found|engagement_exists|engagement_not_found|engagement_cancelled|sessions_incomplete|payments_outstanding|payout_account_unverified|payout_exists|payout_not_found|payout_not_approvable|payout_not_holdable|payout_not_releasable|reason_required|not_completable|service_not_found|service_not_available))/, "").replace(/\s+/g, " ").trim();
}

/** Human-friendly copy for the Postgres guard messages. */
function friendlyError(error: string): string {
  if (error.startsWith("engagement_exists")) {
    return "You already have an open agreement for this course.";
  }
  if (error.startsWith("service_not_available") || error.startsWith("service_not_found")) {
    return "That course offer is no longer available.";
  }
  if (error.startsWith("forbidden")) return "You're not allowed to do that.";
  if (error.startsWith("payout_account_unverified")) {
    return "Add and verify your mobile money account before requesting a payout.";
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
  revalidatePath("/admin");
  return {
    message:
      "Agreement created — pay the first installment (50%) to activate your sessions.",
  };
}

// ---------------------------------------------------------------------------
// Checkout initiation (Paystack)
// ---------------------------------------------------------------------------

/**
 * Shared checkout pipeline: ownership check, payability check, Paystack
 * init. Returns checkoutUrl for the client to redirect to. The payments row
 * is created here as 'initialized' and flipped to 'paid' ONLY by the
 * verified webhook — the callback redirect alone never marks anything paid.
 */
async function runCheckout(
  profile: Pick<Profile, "id">,
  engagementId: string,
  installmentId: string,
): Promise<PaymentFormState> {
  if (!isPaystackConfigured()) {
    return { error: "Payments are not configured yet — please try again later." };
  }

  const supabase = createAdminClient();

  // Ownership: the caller must be the engagement's student.
  const { data: engagement, error: engError } = await supabase
    .from("engagements")
    .select("id, student_id, status")
    .eq("id", engagementId)
    .maybeSingle();
  if (engError || !engagement) return { error: "Agreement not found." };
  const eng = engagement as { id: string; student_id: string; status: string };
  if (eng.student_id !== profile.id) return { error: "forbidden: not your agreement" };
  if (eng.status === "cancelled") return { error: "This agreement was cancelled." };

  // The installment must belong to the engagement and still be payable.
  const { data: installment, error: instError } = await supabase
    .from("installments")
    .select("id, amount, currency, status, idx")
    .eq("id", installmentId)
    .eq("engagement_id", engagementId)
    .maybeSingle();
  if (instError || !installment) return { error: "Installment not found." };
  const inst = installment as {
    id: string;
    amount: string | number;
    currency: string;
    status: string;
    idx: number;
  };
  if (inst.status !== "pending" && inst.status !== "overdue") {
    return { error: `This installment is already ${inst.status}.` };
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

  const { data: init, error: initError } = await supabase
    .from("payments")
    .insert({
      engagement_id: engagementId,
      installment_id: installmentId,
      amount: inst.amount as unknown as string, // BIGINT as string — BigInt breaks JSON.stringify
      currency: inst.currency,
      paystack_reference: reference,
      status: "initialized",
      initialized_by: profile.id,
    })
    .select("id")
    .single();
  if (initError) return { error: `Could not start checkout: ${initError.message}` };

  try {
    const txn = await initializeTransaction({
      email,
      amountPesewas: Number(inst.amount), // pesewas — server-derived, never client-sent
      reference,
      callbackUrl: `${APP_URL}/dashboard?payment=return`,
      metadata: {
        engagement_id: engagementId,
        installment_id: installmentId,
        installment_idx: inst.idx,
      },
    });

    // Paystack returns both; the hosted page is the redirect target.
    const full = txn as unknown as { authorization_url?: string; access_code?: string };
    if (!full.authorization_url) {
      throw new Error("Paystack returned no checkout URL");
    }
    return { message: "Redirecting to Paystack…", checkoutUrl: full.authorization_url };
  } catch (err) {
    // Paystack rejected the init — mark failed so the student can retry
    // with a fresh reference later.
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", (init as { id: string }).id);
    return {
      error: err instanceof Error ? err.message : "Payment initialization failed",
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
 * One-click commit AFTER the tutor accepted the request (request-first,
 * pay-after-acceptance): creates (or re-enters) the payment agreement for
 * the quoted course, then goes straight to Paystack for the first 50%.
 * Reuses an existing open engagement so tapping twice never blocks.
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

  // Gate: the tutor must have ACCEPTED this student's request first
  // (request-first, pay-after-acceptance).
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
    .eq("status", "accepted")
    .maybeSingle();
  if (!request) {
    return {
      error: "Your tutor request hasn't been accepted yet — you can pay once the tutor accepts.",
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

  // First payable installment (idx order) — normally #1, the 50% gate.
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
    revalidatePath("/tutor");
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

  revalidatePath("/tutor");
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
  revalidatePath("/tutor");
  revalidatePath("/admin");
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
  revalidatePath("/admin");
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
  revalidatePath("/admin");
  return { message: "Payout held." };
}

/**
 * Execute an approved payout via Paystack. Called by the admin from the
 * payout queue (or by the automatic path once transfer automation is wired).
 * The payout must be in 'approved'; payment_mark_payout_paid is the only
 * route to 'paid'.
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
  try {
    const { initiateTransfer } = await import("./paystack");
    const transfer = await initiateTransfer({
      amountPesewas: Number(p.amount),
      recipientCode: p.recipient_code,
      reason: `Harcourt tutor payout ${transferCode}`,
    });
    if (transfer.status === "failed") {
      return { error: "Paystack rejected the transfer — check the dashboard." };
    }
  } catch (err) {
    return {
      error: `Transfer failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }

  const { error } = await supabase.rpc("payment_mark_payout_paid", {
    p_actor_id: profile.id,
    p_payout_id: payoutId,
    p_transfer_code: transferCode,
  });
  if (error) return { error: friendlyError(rpcError(error)) };

  scheduleOutboxDrain();
  revalidatePath("/admin");
  revalidatePath("/tutor");
  return { message: "Transfer sent." };
}
