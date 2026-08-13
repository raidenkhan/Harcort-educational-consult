"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTutorReviewed } from "@/lib/email/notify";
import { requireProfile } from "@/services/auth/queries";

/**
 * Admin mutations — the tutor approval workflow.
 *
 * These call SECURITY DEFINER RPCs (admin_approve_tutor / admin_reject_tutor)
 * that atomically update the tutor profile AND write an immutable audit-log
 * entry. The RPC re-verifies the acting admin inside Postgres against the
 * profiles table, so the app never blindly trusts the caller's role claim.
 */

export async function approveTutor(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (profile.role !== "admin") throw new Error("Forbidden");

  const targetId = String(formData.get("tutorProfileId") ?? "");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  if (!targetId) return;

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_approve_tutor", {
    actor_id: profile.id,
    target_id: targetId,
    note: note || null,
  });
  if (error) throw new Error(error.message);

  // Email the tutor the good news (best-effort, after the response).
  notifyTutorReviewedFor(targetId, true, note || null);

  // Bust the cached approved-tutor list on the landing page.
  revalidateTag("tutors", "max");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function rejectTutor(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  if (profile.role !== "admin") throw new Error("Forbidden");

  const targetId = String(formData.get("tutorProfileId") ?? "");
  const note = String(formData.get("note") ?? "Rejected").slice(0, 500);
  if (!targetId) return;

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("admin_reject_tutor", {
    actor_id: profile.id,
    target_id: targetId,
    note,
  });
  if (error) throw new Error(error.message);

  // Email the tutor the decision (best-effort, after the response).
  notifyTutorReviewedFor(targetId, false, note);

  // Bust the cached approved-tutor list on the landing page.
  revalidateTag("tutors", "max");
  revalidatePath("/admin");
  revalidatePath("/");
}

/** Email the owner of a tutor profile about an approve/reject decision. */
async function notifyTutorReviewedFor(
  tutorProfileId: string,
  approved: boolean,
  note: string | null,
): Promise<void> {
  const supabase = createAdminClient();
  const { data: tp } = await supabase
    .from("tutor_profiles")
    .select("profile_id")
    .eq("id", tutorProfileId)
    .maybeSingle();
  if (!tp) return;

  notifyTutorReviewed({
    recipientProfileId: (tp as { profile_id: string }).profile_id,
    approved,
    note,
  });
}
