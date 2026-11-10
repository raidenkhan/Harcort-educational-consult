"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { formText } from "@/lib/forms";
import { profileIsAdmin } from "@/lib/auth/admin";
import { requireProfile, requireRole } from "@/services/auth/queries";
import { discountReasonMessage, isValidDiscountCode, normalizeDiscountCode } from "./codes";
import { checkCodeForStudent } from "./store";

export type DiscountFormState = { error?: string; message?: string };

const createSchema = z.object({
  studentId: z.string().uuid("Choose the student this code is for"),
  percent: z.coerce
    .number({ error: "Enter the discount percentage" })
    .int("Use a whole number, e.g. 15")
    .min(1, "The discount must be at least 1%")
    .max(100, "The discount can't be more than 100%"),
  code: z.preprocess(
    (v) => normalizeDiscountCode(v),
    z
      .string()
      .min(1, "Type a code or generate one")
      .refine(isValidDiscountCode, "Use 4–40 letters, digits or dashes"),
  ),
  expiresAt: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().date("Enter a valid date").optional(),
  ),
  note: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
    z.string().max(300, "Keep the note under 300 characters").optional(),
  ),
});

/** Admin → Discount codes → Create: a personal, single-use percentage code. */
export async function createDiscountCode(
  _prev: DiscountFormState,
  formData: FormData,
): Promise<DiscountFormState> {
  const admin = await requireRole("admin");
  const parsed = createSchema.safeParse({
    studentId: formText(formData.get("studentId")),
    percent: formText(formData.get("percent")),
    code: formText(formData.get("code")),
    expiresAt: formData.get("expiresAt"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { studentId, percent, code, expiresAt, note } = parsed.data;

  const supabase = createAdminClient();
  const { data: student } = await supabase
    .from("profiles")
    .select("full_name, role, is_admin")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || student.role !== "student" || student.is_admin) {
    return { error: "Discount codes can only be made for student accounts." };
  }

  const { error } = await supabase.from("discount_codes").insert({
    code,
    percent,
    student_id: studentId,
    // End of the chosen day, Accra time (GMT).
    expires_at: expiresAt ? `${expiresAt}T23:59:59Z` : null,
    note: note ?? null,
    created_by: admin.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That code already exists — generate another." };
    if (/discount_codes|relation/i.test(error.message)) {
      return { error: "Discount codes aren't set up yet — apply migration 0044 in Supabase, then try again." };
    }
    return { error: `Couldn't create the code: ${error.message}` };
  }

  revalidatePath("/admin/discounts");
  return { message: `${code} — ${percent}% off for ${student.full_name ?? "the student"}. Share it with them.` };
}

/** Admin: stop an active code from being used. */
export async function revokeDiscountCode(id: string): Promise<DiscountFormState> {
  await requireRole("admin");
  if (!z.string().uuid().safeParse(id).success) return { error: "Unknown code." };
  const { data, error } = await createAdminClient()
    .from("discount_codes")
    .update({ status: "revoked" })
    .eq("id", id)
    .eq("status", "active")
    .select("code")
    .maybeSingle();
  if (error) return { error: `Couldn't revoke: ${error.message}` };
  revalidatePath("/admin/discounts");
  return data ? { message: `${data.code} was revoked.` } : { error: "Only active codes can be revoked." };
}

export type DiscountCheckResult = { ok: true; code: string; percent: number } | { ok: false; error: string };

/**
 * Student → "Apply" in the booking dialog or the cart. Checks the code is
 * theirs, active, unused and unexpired; returns the percentage so the page
 * can show the new total. Nothing is reserved — checkout re-checks.
 */
export async function checkDiscountCode(rawCode: string): Promise<DiscountCheckResult> {
  const profile = await requireProfile();
  if (profileIsAdmin(profile)) return { ok: false, error: "Admin accounts can't use discount codes." };
  const code = normalizeDiscountCode(rawCode);
  if (!code) return { ok: false, error: "Enter a discount code." };
  const { check, missingTable } = await checkCodeForStudent(code, profile.id);
  if (missingTable) return { ok: false, error: "Discount codes aren't available yet." };
  if (!check.ok) return { ok: false, error: discountReasonMessage(check.reason) };
  return { ok: true, code, percent: check.percent };
}
