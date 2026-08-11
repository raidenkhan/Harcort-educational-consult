"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/services/auth/queries";
import { isConversationMember } from "./queries";
import type { Conversation } from "@/types";

/**
 * Chat mutations.
 * The acting user is derived from the session cookie on every call; the
 * service-role client bypasses RLS, so authorization (student-only start,
 * member-only send) is enforced here explicitly.
 */

export type ConversationFormState = {
  ok?: boolean;
  conversationId?: string;
  error?: string;
};

const MAX_MESSAGE_LENGTH = 2000;

/** Student starts (or re-enters) a conversation with a tutor. */
export async function startConversation(
  _prev: ConversationFormState,
  formData: FormData,
): Promise<ConversationFormState> {
  const profile = await requireProfile();
  if (profile.role !== "student") {
    return { error: "Only student accounts can start a conversation." };
  }

  const tutorProfileId = String(formData.get("tutorProfileId") ?? "");
  if (!tutorProfileId) return { error: "Missing tutor." };

  const supabase = createAdminClient();

  // Only approved tutors are contactable — the action is the real boundary
  // (the home page only shows approved tutors, but we re-check here).
  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id, verification_status")
    .eq("id", tutorProfileId)
    .maybeSingle();

  if (!tutorProfile) return { error: "Tutor not found." };
  if ((tutorProfile as { verification_status: string }).verification_status !== "approved") {
    return { error: "This tutor isn't available yet." };
  }

  const { data: inserted, error } = await supabase
    .from("conversations")
    .insert({ student_id: profile.id, tutor_profile_id: tutorProfileId })
    .select("id")
    .maybeSingle();

  if (error) {
    // unique (student_id, tutor_profile_id) — they already talked. Re-open it.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("student_id", profile.id)
        .eq("tutor_profile_id", tutorProfileId)
        .maybeSingle();
      return existing
        ? { ok: true, conversationId: (existing as { id: string }).id }
        : { error: "You already have a conversation with this tutor." };
    }
    return { error: error.message };
  }

  revalidatePath("/chat");
  return { ok: true, conversationId: (inserted as { id: string }).id };
}

/** Send a message in a conversation the caller is a member of. */
export async function sendMessage(
  formData: FormData,
): Promise<ConversationFormState> {
  const profile = await requireProfile();

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!conversationId) return { error: "Missing conversation." };
  if (!body) return { error: "Type a message first." };
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { error: `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.` };
  }

  const supabase = createAdminClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, student_id, tutor_profile_id, admin_id, status")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) return { error: "Conversation not found." };
  if (!(await isConversationMember(conversation as Conversation, profile.id))) {
    return { error: "You don't have access to this conversation." };
  }
  if ((conversation as { status: string }).status === "closed") {
    return { error: "This conversation is closed." };
  }

  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    sender_id: profile.id,
    body,
  });
  if (error) return { error: error.message };

  revalidatePath("/chat");
  return { ok: true };
}

/** Admin starts (or re-enters) a conversation with a student or tutor. */
export async function startAdminConversation(
  _prev: ConversationFormState,
  formData: FormData,
): Promise<ConversationFormState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") {
    return { error: "Only admins can start conversations here." };
  }

  const targetType = String(formData.get("targetType") ?? "");
  const targetId = String(formData.get("targetId") ?? "");
  if (!targetType || !targetId) {
    return { error: "Choose someone to message." };
  }

  const supabase = createAdminClient();
  const insert: { admin_id: string; student_id?: string; tutor_profile_id?: string } = {
    admin_id: profile.id,
  };

  if (targetType === "student") {
    const { data: student } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", targetId)
      .maybeSingle();
    if (!student || (student as { role: string }).role !== "student") {
      return { error: "Student not found." };
    }
    insert.student_id = targetId;
  } else if (targetType === "tutor") {
    const { data: tutorProfile } = await supabase
      .from("tutor_profiles")
      .select("id, verification_status")
      .eq("id", targetId)
      .maybeSingle();
    if (!tutorProfile) return { error: "Tutor not found." };
    if (
      (tutorProfile as { verification_status: string }).verification_status !==
      "approved"
    ) {
      return { error: "This tutor isn't available yet." };
    }
    insert.tutor_profile_id = targetId;
  } else {
    return { error: "Unknown target type." };
  }

  const { data: inserted, error } = await supabase
    .from("conversations")
    .insert(insert)
    .select("id")
    .maybeSingle();

  if (error) {
    // Partial unique (admin_id, student_id)/(admin_id, tutor_profile_id) —
    // they already have a thread. Re-open it.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("admin_id", profile.id)
        .eq(targetType === "student" ? "student_id" : "tutor_profile_id", targetId)
        .maybeSingle();
      return existing
        ? { ok: true, conversationId: (existing as { id: string }).id }
        : { error: "You already have a conversation with this person." };
    }
    return { error: error.message };
  }

  revalidatePath("/chat");
  return { ok: true, conversationId: (inserted as { id: string }).id };
}
