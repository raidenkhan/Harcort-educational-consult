"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/services/auth/queries";

/**
 * Chat mutations (Phase 2 — realtime messaging).
 * The acting user is pinned to the conversation as student_id, and only
 * students may start conversations; realtime broadcast is enabled on the
 * messages table.
 */

export async function startConversation(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const profile = await requireProfile();
  if (profile.role !== "student") {
    return { error: "Only student accounts can start a conversation." };
  }

  const tutorProfileId = String(formData.get("tutorProfileId") ?? "");
  if (!tutorProfileId) return { error: "Missing tutor." };

  const supabase = createAdminClient();

  const { error } = await supabase.from("conversations").insert({
    student_id: profile.id,
    tutor_profile_id: tutorProfileId,
  });

  if (error) {
    // unique (student_id, tutor_profile_id) — a conversation already exists.
    if (error.code === "23505") {
      return { error: "You already have a conversation with this tutor." };
    }
    return { error: error.message };
  }

  revalidatePath("/chat");
  return undefined;
}
