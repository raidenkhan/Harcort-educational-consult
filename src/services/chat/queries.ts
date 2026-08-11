import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/services/auth/queries";
import type { Conversation, ConversationStatus, Message, Profile } from "@/types";

/**
 * Chat queries — the /chat page's data layer.
 *
 * These run on the service-role client (RLS bypassed), so every read is
 * explicitly scoped to the signed-in user: as the student on one side of a
 * conversation, or as the owner of the tutor profile on the other.
 */

export interface ConversationListItem {
  id: string;
  otherName: string;
  status: ConversationStatus;
  createdAt: string;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
}

type ConversationRow = Conversation & {
  student?: { full_name: string };
  tutor_profile?: { id: string; profiles?: { full_name: string } };
};

/** True when the profile is the student or owns the tutor profile on it. */
export async function isConversationMember(
  conversation: { student_id: string; tutor_profile_id: string },
  profileId: string,
): Promise<boolean> {
  if (conversation.student_id === profileId) return true;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("id", conversation.tutor_profile_id)
    .eq("profile_id", profileId)
    .maybeSingle();
  return Boolean(data);
}

/** The signed-in user's conversations, newest first, with the other party's
 *  name and a last-message preview for the list sidebar. */
export async function listConversationsForUser(): Promise<ConversationListItem[]> {
  const current = await getCurrentProfile();
  if (!current) return [];

  const supabase = createAdminClient();

  // Tutor profiles owned by me (the tutor side of the membership filter).
  const { data: tutorProfiles } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", current.id);
  const tutorProfileIds = (tutorProfiles ?? []).map((t) => t.id as string);

  let query = supabase
    .from("conversations")
    .select(
      "*, student:profiles!student_id(full_name), tutor_profile:tutor_profiles(id, profiles(full_name))",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (tutorProfileIds.length > 0) {
    query = query.or(
      `student_id.eq.${current.id},tutor_profile_id.in.(${tutorProfileIds.join(",")})`,
    );
  } else {
    query = query.eq("student_id", current.id);
  }

  const { data: rows } = await query;
  const conversations = (rows ?? []) as ConversationRow[];

  if (conversations.length === 0) return [];

  // Newest-first, capped: the FIRST row per conversation is its last message,
  // so we never download whole threads just for a one-line preview.
  const { data: messages } = await supabase
    .from("messages")
    .select("conversation_id, body, sender_id, created_at")
    .in("conversation_id", conversations.map((c) => c.id))
    .order("created_at", { ascending: false })
    .limit(300);

  const lastByConversation = new Map<string, Message>();
  for (const m of (messages ?? []) as Message[]) {
    if (!lastByConversation.has(m.conversation_id)) {
      lastByConversation.set(m.conversation_id, m);
    }
  }

  return conversations.map((c) => {
    const last = lastByConversation.get(c.id);
    return {
      id: c.id,
      otherName:
        current.role === "student"
          ? (c.tutor_profile?.profiles?.full_name ?? "Tutor")
          : (c.student?.full_name ?? "Student"),
      status: c.status,
      createdAt: c.created_at,
      lastMessage: last
        ? { body: last.body, senderId: last.sender_id, createdAt: last.created_at }
        : null,
    };
  });
}

/** Header info for the active thread — membership-checked. */
export async function getConversationMeta(
  conversationId: string,
  profile: Profile,
): Promise<{ otherName: string; status: ConversationStatus } | null> {
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("conversations")
    .select(
      "student_id, tutor_profile_id, status, student:profiles!student_id(full_name), tutor_profile:tutor_profiles(id, profiles(full_name))",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!row) return null;
  const conversation = row as unknown as ConversationRow;
  if (!(await isConversationMember(conversation, profile.id))) return null;

  return {
    otherName:
      profile.role === "student"
        ? (conversation.tutor_profile?.profiles?.full_name ?? "Tutor")
        : (conversation.student?.full_name ?? "Student"),
    status: conversation.status,
  };
}

/** Full message thread for one conversation, oldest first. Null when the
 *  conversation doesn't exist or the caller isn't a member. */
export async function listMessagesForConversation(
  conversationId: string,
  profile: Profile,
): Promise<Message[] | null> {
  const supabase = createAdminClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("student_id, tutor_profile_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) return null;
  if (!(await isConversationMember(conversation as Conversation, profile.id))) {
    return null;
  }

  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  return (data as Message[]) ?? [];
}
