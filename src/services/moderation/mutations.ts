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
  targetType: z.string().trim().min(1).max(40, "Unknown report type"),
  targetId: z.string().uuid("Unknown report target"),
  reason: z
    .string()
    .trim()
    .min(5, "Please describe the issue (min 5 characters)")
    .max(1000, "Please keep the description under 1000 characters"),
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

  revalidatePath("/admin", "layout");
  return { message: "Report submitted. Thank you for helping keep Harcourt safe." };
}
