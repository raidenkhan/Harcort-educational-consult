"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/services/auth/queries";
import { z } from "zod";

/**
 * Moderation mutations (skeleton).
 * Any signed-in user may file a report; the reporter is pinned server-side.
 */

const reportSchema = z.object({
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  reason: z.string().trim().min(5, "Please describe the issue (min 5 characters)"),
});

export type ReportFormState = { error?: string; message?: string };

export async function fileReport(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const profile = await requireProfile();

  const parsed = reportSchema.safeParse({
    targetType: formData.get("targetType"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const supabase = createAdminClient();

  const { error } = await supabase.from("reports").insert({
    reporter_id: profile.id,
    target_type: parsed.data.targetType,
    target_id: parsed.data.targetId,
    reason: parsed.data.reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { message: "Report submitted. Thank you for helping keep Harcot safe." };
}
