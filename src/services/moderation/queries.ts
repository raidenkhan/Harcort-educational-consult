import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportStatus } from "@/types";

/**
 * Moderation queries (skeleton — full moderation UX lands after chat ships).
 * The admin page gates access with requireRole("admin").
 */

export interface ReportRow {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  status: ReportStatus;
  created_at: string;
}

export async function listOpenReports(): Promise<ReportRow[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("reports")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  return (data as ReportRow[]) ?? [];
}
