import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, profileIsAdmin } from "@/services/auth/queries";
import type {
  Conversation,
  ConversationStatus,
  Message,
  Profile,
  UserRole,
} from "@/types";

/**
 * Chat queries — the /chat page's data layer.
 *
 * These run on the service-role client (RLS bypassed), so every read is
 * explicitly scoped to the signed-in user: as the student on one side of a
 * conversation, the owner of the tutor profile on the other, or the admin
 * participant (0007) — verified in the UI with a petrol badge.
 */

export interface ConversationListItem {
  id: string;
  otherName: string;
  /** True when the other party is the Harcourt admin (verified badge). */
  otherIsAdmin: boolean;
  status: ConversationStatus;
  createdAt: string;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
}

/** Who an admin can start a conversation with. */
export interface ChatTarget {
  type: "student" | "tutor";
  /** Student → profile id; tutor → tutor_profile id. */
  id: string;
  name: string;
}

type ConversationRow = Conversation & {
  student?: { full_name: string };
  tutor_profile?: { id: string; profiles?: { full_name: string } };
  admin?: { full_name: string };
};

/** The other party's display name from the acting user's side. */
function otherPartyName(row: ConversationRow, myRole: UserRole): string {
  if (myRole === "student") {
    if (row.admin_id) return row.admin?.full_name ?? "Harcourt admin";
    return row.tutor_profile?.profiles?.full_name ?? "Tutor";
  }
  if (myRole === "tutor") {
    if (row.admin_id) return row.admin?.full_name ?? "Harcourt admin";
    return row.student?.full_name ?? "Student";
  }
  // Admin's view — the other side is the student or the tutor.
  if (row.student_id) return row.student?.full_name ?? "Student";
  return row.tutor_profile?.profiles?.full_name ?? "Tutor";
}

/** True when the profile is the student, owns the tutor profile, or is the
 *  admin participant on the conversation. */
export async function isConversationMember(
  conversation: {
    student_id: string | null;
    tutor_profile_id: string | null;
    admin_id: string | null;
  },
  profileId: string,
): Promise<boolean> {
  if (conversation.student_id === profileId) return true;
  if (conversation.admin_id === profileId) return true;
  if (!conversation.tutor_profile_id) return false;

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

  // Admins only see conversations where they're the admin participant — a
  // profile promoted from student to admin shouldn't surface its old
  // student-side threads here.
  // Admins (flag or legacy role) only see conversations where they're the
  // admin participant — a profile promoted from student to admin shouldn't
  // surface its old student-side threads here. Admin-tutors still see their
  // tutor threads via the tutor_profile_id.in(...) part below.
  const orParts = profileIsAdmin(current)
    ? [`admin_id.eq.${current.id}`]
    : [`student_id.eq.${current.id}`];
  if (tutorProfileIds.length > 0) {
    orParts.push(`tutor_profile_id.in.(${tutorProfileIds.join(",")})`);
  }

  const { data: rows } = await supabase
    .from("conversations")
    .select(
      "*, student:profiles!student_id(full_name), tutor_profile:tutor_profiles(id, profiles(full_name)), admin:profiles!admin_id(full_name)",
    )
    .or(orParts.join(","))
    .order("created_at", { ascending: false })
    .limit(50);

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
      otherName: otherPartyName(c, current.role),
      otherIsAdmin: Boolean(c.admin_id) && c.admin_id !== current.id,
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
): Promise<{
  otherName: string;
  otherIsAdmin: boolean;
  adminId: string | null;
  status: ConversationStatus;
} | null> {
  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("conversations")
    .select(
      "student_id, tutor_profile_id, admin_id, status, student:profiles!student_id(full_name), tutor_profile:tutor_profiles(id, profiles(full_name)), admin:profiles!admin_id(full_name)",
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (!row) return null;
  const conversation = row as unknown as ConversationRow;
  if (!(await isConversationMember(conversation, profile.id))) return null;

  return {
    otherName: otherPartyName(conversation, profile.role),
    otherIsAdmin: Boolean(conversation.admin_id) && conversation.admin_id !== profile.id,
    adminId: conversation.admin_id ?? null,
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
    .select("student_id, tutor_profile_id, admin_id")
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

/** Approved students + tutors the admin can start a conversation with. */
export async function listChatTargetsForAdmin(): Promise<ChatTarget[]> {
  const supabase = createAdminClient();

  const [{ data: students }, { data: tutors }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .order("full_name")
      .limit(300),
    supabase
      .from("tutor_profiles")
      .select("id, profiles(full_name)")
      .eq("verification_status", "approved")
      .order("created_at")
      .limit(300),
  ]);

  return [
    ...(students ?? []).map((s) => ({
      type: "student" as const,
      id: s.id as string,
      name: (s as { full_name: string }).full_name || "Student",
    })),
    ...(tutors ?? []).map((t) => {
      const tp = t as unknown as {
        id: string;
        profiles?: { full_name: string } | { full_name: string }[];
      };
      const fullName = Array.isArray(tp.profiles)
        ? tp.profiles[0]?.full_name
        : tp.profiles?.full_name;
      return { type: "tutor" as const, id: tp.id, name: fullName || "Tutor" };
    }),
  ];
}
