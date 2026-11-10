import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/postgres";
import {
  checkDiscountEligibility,
  isValidDiscountCode,
  normalizeDiscountCode,
  type DiscountCheck,
} from "./codes";

/**
 * Discount codes (0044) — database side. Personal, single-use percentages;
 * Harcourt absorbs the discount through `apply_discount_credit`, which runs
 * only once the student's real payment is verified (or straight away for a
 * 100% code, where there is nothing to pay).
 */

export interface DiscountCodeRow {
  id: string;
  code: string;
  percent: number;
  student_id: string;
  status: "active" | "used" | "revoked";
  expires_at: string | null;
}

export type Allocation = { engagement_id: string; amount: number };

/** Look a code up and decide whether this student may use it now. */
export async function checkCodeForStudent(
  rawCode: string,
  studentId: string,
): Promise<{ check: DiscountCheck; row: DiscountCodeRow | null; missingTable?: boolean }> {
  const code = normalizeDiscountCode(rawCode);
  // Validate BEFORE the query: `ilike` treats `_` and `%` as wildcards, so an
  // unvalidated input like "AMA-ME2-______" could match someone else's code.
  // Valid codes are letters, digits and dashes only — no wildcard can pass.
  if (!isValidDiscountCode(code)) return { check: { ok: false, reason: "not_found" }, row: null };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("discount_codes")
    .select("id, code, percent, student_id, status, expires_at")
    .ilike("code", code)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { check: { ok: false, reason: "not_found" }, row: null, missingTable: true };
    throw new Error(`discount lookup failed: ${error.message}`);
  }
  const row = data as DiscountCodeRow | null;

  let applied = false;
  if (row) {
    const { data: redemption } = await supabase
      .from("discount_redemptions")
      .select("status")
      .eq("code_id", row.id)
      .maybeSingle();
    applied = (redemption as { status?: string } | null)?.status === "applied";
  }
  return { check: checkDiscountEligibility(row, studentId, Date.now(), applied), row };
}

/**
 * Point the code's (single) redemption at this checkout. An abandoned earlier
 * checkout's PENDING row is re-pointed rather than duplicated; an APPLIED one
 * means the code is spent and the caller must refuse.
 */
export async function recordPendingRedemption(input: {
  row: DiscountCodeRow;
  studentId: string;
  reference: string;
  allocations: Allocation[];
  discountTotal: bigint;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("discount_redemptions")
    .select("id, status")
    .eq("code_id", input.row.id)
    .maybeSingle();
  const prior = existing as { id: string; status: string } | null;
  if (prior?.status === "applied") return { ok: false, error: "That discount code has already been used." };

  const payload = {
    code_id: input.row.id,
    student_id: input.studentId,
    reference: input.reference,
    percent: input.row.percent,
    discount_amount: Number(input.discountTotal),
    allocations: input.allocations,
    status: "pending",
    updated_at: new Date().toISOString(),
  };
  const { error } = prior
    ? await supabase.from("discount_redemptions").update(payload).eq("id", prior.id).eq("status", "pending")
    : await supabase.from("discount_redemptions").insert(payload);
  if (error) return { ok: false, error: `Couldn't apply the discount: ${error.message}` };
  return { ok: true };
}

/**
 * Credit the discount for a verified payment — exactly once. The UPDATE …
 * WHERE status = 'pending' is the atomic claim: when the webhook, the return
 * path and the sweep race on one reference, only one wins and applies the
 * credits. Safe to call for any reference (no pending redemption → no-op).
 */
export async function applyPendingDiscount(reference: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: claimed, error } = await supabase
    .from("discount_redemptions")
    .update({ status: "applied", applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("reference", reference)
    .eq("status", "pending")
    .select("id, code_id, allocations")
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error(`[discounts] claim failed for ${reference}: ${error.message}`);
    return;
  }
  if (!claimed) return;

  const redemption = claimed as { id: string; code_id: string; allocations: Allocation[] };
  for (const allocation of redemption.allocations ?? []) {
    if (!allocation?.engagement_id || !(allocation.amount > 0)) continue;
    const { error: creditError } = await supabase.rpc("apply_discount_credit", {
      p_engagement_id: allocation.engagement_id,
      p_amount: allocation.amount,
      p_code_id: redemption.code_id,
    });
    if (creditError) {
      // The claim already flipped, so this won't be retried automatically —
      // log loudly: an admin must record the missing credit by hand.
      console.error(
        `[discounts] CREDIT FAILED — ${allocation.amount} pesewas on engagement ${allocation.engagement_id} (redemption ${redemption.id}): ${creditError.message}`,
      );
    }
  }

  await supabase
    .from("discount_codes")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", redemption.code_id);
}

export interface AdminDiscountRow {
  id: string;
  code: string;
  percent: number;
  status: "active" | "used" | "revoked" | "expired";
  studentName: string;
  studentCode: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
  note: string | null;
}

/** All codes for the admin list, newest first. Null when 0044 isn't applied. */
export async function listDiscountCodesForAdmin(): Promise<AdminDiscountRow[] | null> {
  const { data, error } = await createAdminClient()
    .from("discount_codes")
    .select("id, code, percent, status, expires_at, used_at, created_at, note, profiles!discount_codes_student_id_fkey(full_name, public_code)")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (!isMissingTable(error)) console.error(`[discounts] list failed: ${error.message}`);
    return null;
  }
  const now = Date.now();
  type Row = {
    id: string; code: string; percent: number; status: "active" | "used" | "revoked";
    expires_at: string | null; used_at: string | null; created_at: string; note: string | null;
    profiles?: { full_name: string | null; public_code: string | null } | { full_name: string | null; public_code: string | null }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const expired = r.status === "active" && r.expires_at !== null && Date.parse(r.expires_at) < now;
    return {
      id: r.id,
      code: r.code,
      percent: r.percent,
      status: expired ? "expired" : r.status,
      studentName: p?.full_name ?? "Student",
      studentCode: p?.public_code ?? null,
      expiresAt: r.expires_at,
      usedAt: r.used_at,
      createdAt: r.created_at,
      note: r.note,
    };
  });
}

export interface DiscountStudentOption {
  id: string;
  name: string;
  programme: string | null;
  year: number | null;
  publicCode: string | null;
}

/** Students a code can be made for (the Create modal's picker). */
export async function listStudentsForDiscounts(): Promise<DiscountStudentOption[]> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, full_name, program, year, public_code")
    .eq("role", "student")
    .eq("is_admin", false)
    .order("full_name")
    .limit(2000);
  if (error) {
    console.error(`[discounts] student list failed: ${error.message}`);
    return [];
  }
  return ((data ?? []) as { id: string; full_name: string | null; program: string | null; year: number | null; public_code: string | null }[]).map(
    (r) => ({ id: r.id, name: r.full_name || "Student", programme: r.program, year: r.year, publicCode: r.public_code }),
  );
}
