import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/services/auth/queries";
import type { Conversation } from "@/types";

/**
 * Chat queries (Phase 2 — realtime messaging).
 * Conversations are scoped explicitly to the signed-in user: as the student
 * on one side, or as the owner of the tutor profile on the other.
 */

export async function listConversationsForUser(): Promise<Conversation[]> {
  const current = await getCurrentProfile();
  if (!current) return [];

  const supabase = createAdminClient();

  // The tutor-side of the membership check: tutor profile ids owned by me.
  const { data: tutorProfiles } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", current.id);
  const tutorProfileIds = (tutorProfiles ?? []).map((t) => t.id as string);

  let query = supabase
    .from("conversations")
    .select("*")
    .order("created_at", { ascending: false });

  if (tutorProfileIds.length > 0) {
    query = query.or(
      `student_id.eq.${current.id},tutor_profile_id.in.(${tutorProfileIds.join(",")})`,
    );
  } else {
    query = query.eq("student_id", current.id);
  }

  const { data } = await query;
  return (data as Conversation[]) ?? [];
}
