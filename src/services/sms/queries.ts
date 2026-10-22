import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin reads for the SMS console (0027).
 *
 * Everything here is service-role only — `sms_messages` has deny-all RLS, so
 * the admin page is the gate (it calls requireRole("admin")).
 */

export interface SmsMessageRow {
  id: number;
  profileId: string | null;
  toNumber: string;
  body: string;
  kind: string;
  smsId: string | null;
  status: string;
  deliveryStatus: string | null;
  error: string | null;
  createdAt: string;
}

export interface SmsStats {
  /** Sends logged today (excluding skipped ones). */
  today: number;
  /** Failures today. */
  failedToday: number;
  /** Total sends logged, all time. */
  total: number;
  /** How many numbers are opted out. */
  optedOut: number;
  /** How many profiles have a number at all. */
  withPhone: number;
}

function toRow(row: Record<string, unknown>): SmsMessageRow {
  return {
    id: row.id as number,
    profileId: (row.profile_id as string | null) ?? null,
    toNumber: (row.to_number as string) ?? "",
    body: (row.body as string) ?? "",
    kind: (row.kind as string) ?? "",
    smsId: (row.sms_id as string | null) ?? null,
    status: (row.status as string) ?? "",
    deliveryStatus: (row.delivery_status as string | null) ?? null,
    error: (row.error as string | null) ?? null,
    createdAt: (row.created_at as string) ?? "",
  };
}

/** The most recent sends, newest first. */
export async function listRecentSmsMessages(
  limit = 50,
): Promise<SmsMessageRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sms_messages")
    .select(
      "id, profile_id, to_number, body, kind, sms_id, status, delivery_status, error, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[sms] admin log query failed: ${error.message}`);
    return [];
  }
  return (data ?? []).map((row) => toRow(row as Record<string, unknown>));
}

/** Counts for the console tiles. */
export async function smsStats(now: number): Promise<SmsStats> {
  const supabase = createAdminClient();
  const dayStart = new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z";

  const [today, failedToday, total, optedOut, withPhone] = await Promise.all([
    supabase
      .from("sms_messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart)
      .neq("status", "skipped"),
    supabase
      .from("sms_messages")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart)
      .eq("status", "failed"),
    supabase.from("sms_messages").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("sms_opt_out", true),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("phone", "is", null),
  ]);

  return {
    today: today.count ?? 0,
    failedToday: failedToday.count ?? 0,
    total: total.count ?? 0,
    optedOut: optedOut.count ?? 0,
    withPhone: withPhone.count ?? 0,
  };
}
