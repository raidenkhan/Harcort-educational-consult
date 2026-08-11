import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Admin queries. Pages gate access with requireRole("admin"); reads run on
 * the server-only client and scope explicitly (defense in depth).
 */

export interface PendingTutorRow {
  id: string;
  full_name: string;
  bio: string | null;
  rate_per_hour: number | null;
  created_at: string;
}

interface TutorProfileRow {
  id: string;
  bio: string | null;
  rate_per_hour: number | null;
  created_at: string;
  profiles: { full_name: string } | { full_name: string }[];
}

export async function listPendingTutors(): Promise<PendingTutorRow[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tutor_profiles")
    .select("id, bio, rate_per_hour, created_at, profiles(full_name)")
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true });

  return (data ?? []).map((row: TutorProfileRow) => ({
    id: row.id,
    full_name: Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name,
    bio: row.bio,
    rate_per_hour: row.rate_per_hour,
    created_at: row.created_at,
  }));
}

export async function listApprovedTutorsForAdmin(): Promise<number> {
  const supabase = createAdminClient();

  const { count } = await supabase
    .from("tutor_profiles")
    .select("*", { count: "exact", head: true })
    .eq("verification_status", "approved");

  return count ?? 0;
}
