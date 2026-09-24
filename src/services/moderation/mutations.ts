"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import { deliver } from "@/lib/email/notify";
import { adminEmails, emailsForProfiles } from "@/lib/email/recipients";
import { reportFiledEmail, reportResolvedEmail } from "@/lib/email/templates";
import { z } from "zod";

/**
 * Moderation mutations. Any signed-in user may file a report; the reporter
 * is pinned server-side. Only admins (profileIsAdmin — privilege, not role)
 * resolve or dismiss, and every resolution writes an admin_audit_log row.
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

const resolveSchema = z.object({
  reportId: z.string().uuid("Unknown report"),
  decision: z.enum(["resolved", "dismissed"]),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters").optional(),
});

export type ReportFormState = { error?: string; message?: string };

/** File a report against a message/conversation/profile. */
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

  // Admins get an email so a serious report doesn't sit unseen. Best-effort,
  // after the response — a failed notification never blocks the report.
  const notify = async () => {
    try {
      const emails = await adminEmails();
      if (emails.length === 0) return;
      const email = reportFiledEmail({
        reporterName: profile.full_name,
        targetType: parsed.data.targetType,
        reasonPreview: parsed.data.reason.slice(0, 200),
      });
      await Promise.all(emails.map((to) => deliver(to, email)));
    } catch (err) {
      console.error("[moderation] filed-report email failed", err);
    }
  };
  try {
    after(notify);
  } catch {
    void notify();
  }

  revalidatePath("/admin", "layout");
  return { message: "Report submitted. Thank you for helping keep Harcourt safe." };
}

/** Resolve or dismiss one report (admin only) — audited, emails the reporter. */
export async function resolveReport(
  _prev: ReportFormState,
  formData: FormData,
): Promise<ReportFormState> {
  const profile = await requireProfile();
  if (!profileIsAdmin(profile)) {
    return { error: "Only admins can resolve reports." };
  }

  const parsed = resolveSchema.safeParse({
    reportId: formData.get("reportId"),
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const supabase = createAdminClient();

  // Read before update: the out-of-band email + audit log need reporter and
  // target context, and the status guard prevents double-resolution races.
  const { data: report } = await supabase
    .from("reports")
    .select("id, reporter_id, target_type, target_id, status")
    .eq("id", parsed.data.reportId)
    .maybeSingle();

  const row = report as {
    id: string;
    reporter_id: string;
    target_type: string;
    target_id: string;
    status: string;
  } | null;

  if (!row) return { error: "Report not found." };
  if (row.status !== "open") {
    return { error: "This report was already handled." };
  }

  const resolvedAt = new Date().toISOString();

  const { error } = await supabase
    .from("reports")
    .update({
      status: parsed.data.decision,
      resolved_at: resolvedAt,
      resolved_by: profile.id,
      resolution_note: parsed.data.note ?? null,
    })
    .eq("id", parsed.data.reportId)
    .eq("status", "open"); // status guard: only open → resolved/dismissed

  if (error) return { error: error.message };

  // Audit trail — the admin's action, on the record.
  await supabase.from("admin_audit_log").insert({
    admin_id: profile.id,
    action: parsed.data.decision === "resolved" ? "report.resolved" : "report.dismissed",
    target_type: "report",
    target_id: parsed.data.reportId,
    metadata: {
      report_target_type: row.target_type,
      report_target_id: row.target_id,
      note: parsed.data.note ?? null,
    },
  });

  // Reporter follow-up — closed loop, best-effort after the response.
  const notify = async () => {
    try {
      const emails = await emailsForProfiles([row.reporter_id]);
      const to = emails.get(row.reporter_id);
      if (!to) return;
      await deliver(
        to,
        reportResolvedEmail({
          decision: parsed.data.decision,
          targetType: row.target_type,
          note: parsed.data.note ?? null,
        }),
      );
    } catch (err) {
      console.error("[moderation] resolution email failed", err);
    }
  };
  try {
    after(notify);
  } catch {
    void notify();
  }

  revalidatePath("/admin", "layout");
  return {
    message:
      parsed.data.decision === "resolved"
        ? "Report resolved."
        : "Report dismissed.",
  };
}
