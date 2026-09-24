import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportStatus } from "@/types";

/**
 * Reports moderation queries — the admin's view of what users have flagged.
 * Every report resolves to exactly one of: open → resolved | dismissed.
 * Resolution history lives on the row (0013 columns) and in admin_audit_log
 * (written at resolve time by mutations.ts).
 */

export interface ReportView {
  id: string;
  status: ReportStatus;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;

  /** Reporter context (joined from profiles). */
  reporterId: string;
  reporterName: string;
  reporterCode: string | null;

  /** Human-readable description of the reported thing. */
  targetType: string;
  targetLabel: string;
  targetDetail: string | null;
}

interface JoinedRow {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  target_type: string;
  target_id: string;
  reporter: {
    id: string;
    full_name: string;
    public_code: string | null;
  } | null;
}

const TARGET_LABELS: Record<string, string> = {
  message: "Chat message",
  conversation: "Conversation",
  profile: "User profile",
  tutor_profile: "Tutor profile",
};

/** One row per target_type: how to fetch + describe the reported entity. */
async function describeTargets(
  rows: JoinedRow[],
): Promise<Map<string, { label: string; detail: string | null }>> {
  const map = new Map<string, { label: string; detail: string | null }>();

  const messages = rows.filter((r) => r.target_type === "message");
  if (messages.length > 0) {
    const { data } = await createAdminClient()
      .from("messages")
      .select("id, body, sender:profiles!sender_id(full_name), created_at")
      .in(
        "id",
        messages.map((r) => r.target_id),
      );
    for (const m of data ?? []) {
      const row = m as {
        id: string;
        body: string;
        sender?: { full_name: string } | { full_name: string }[] | null;
        created_at: string;
      };
      const sender = Array.isArray(row.sender) ? row.sender[0] : row.sender;
      map.set(row.id, {
        label: TARGET_LABELS.message ?? "Message",
        detail: `“${row.body.slice(0, 160)}” — ${
          sender?.full_name ?? "unknown"
        }, ${new Date(row.created_at).toISOString().slice(0, 10)}`,
      });
    }
  }

  const conversations = rows.filter((r) => r.target_type === "conversation");
  if (conversations.length > 0) {
    const { data } = await createAdminClient()
      .from("conversations")
      .select(
        "id, status, student:profiles!student_id(full_name), tutor_profile:tutor_profiles(profiles(full_name))",
      )
      .in(
        "id",
        conversations.map((r) => r.target_id),
      );
    for (const c of data ?? []) {
      const row = c as {
        id: string;
        status: string;
        student?: { full_name: string } | { full_name: string }[] | null;
        tutor_profile?: {
          profiles?: { full_name: string } | { full_name: string }[] | null;
        } | null;
      };
      const student = Array.isArray(row.student) ? row.student[0] : row.student;
      const tp = Array.isArray(row.tutor_profile)
        ? row.tutor_profile[0]
        : row.tutor_profile;
      const tutor = Array.isArray(tp?.profiles) ? tp.profiles[0] : tp?.profiles;
      map.set(row.id, {
        label: "Conversation",
        detail: `${student?.full_name ?? "Student"} ↔ ${
          tutor?.full_name ?? "Tutor"
        } (${row.status})`,
      });
    }
  }

  // Generic fallback for any other target_type (profiles, tutor_profile, …):
  // fetch the profile's name so admins see who was reported.
  const profileTargets = rows.filter(
    (r) => r.target_type !== "message" && r.target_type !== "conversation",
  );
  if (profileTargets.length > 0) {
    const { data } = await createAdminClient()
      .from("profiles")
      .select("id, full_name, public_code")
      .in(
        "id",
        profileTargets.map((r) => r.target_id),
      );
    for (const p of data ?? []) {
      const row = p as { id: string; full_name: string; public_code: string | null };
      const source = profileTargets.find((r) => r.target_id === row.id);
      map.set(row.id, {
        label: TARGET_LABELS[source?.target_type ?? ""] ?? "User",
        detail: `${row.full_name}${row.public_code ? ` · ${row.public_code}` : ""}`,
      });
    }
  }

  return map;
}

/** Every report, open first then newest-resolved, for the admin queue. */
export async function listReportsForAdmin(): Promise<ReportView[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("reports")
    .select(
      `id, status, reason, created_at, resolved_at, resolution_note,
       target_type, target_id,
       reporter:profiles!reports_reporter_id_fkey(id, full_name, public_code)`,
    )
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(`listReportsForAdmin: ${error.message}`);

  const rows = (data ?? []) as unknown as JoinedRow[];
  const targetInfo = await describeTargets(rows);

  return rows.map((row) => {
    const reporter = Array.isArray(row.reporter) ? row.reporter[0] : row.reporter;
    const info = targetInfo.get(row.target_id);
    return {
      id: row.id,
      status: row.status as ReportStatus,
      reason: row.reason ?? "",
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      resolutionNote: row.resolution_note,
      reporterId: reporter?.id ?? "",
      reporterName: reporter?.full_name ?? "Unknown",
      reporterCode: reporter?.public_code ?? null,
      targetType: row.target_type,
      targetLabel: info?.label ?? TARGET_LABELS[row.target_type] ?? row.target_type,
      targetDetail: info?.detail ?? null,
    };
  });
}
