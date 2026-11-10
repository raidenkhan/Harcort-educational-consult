import type { Profile } from "@/types";
import { profileIsAdmin } from "@/services/auth/queries";
import {
  listConversationsForUser,
  getThreadForUser,
  listChatTargetsForAdmin,
} from "@/services/chat/queries";
import { ChatView } from "@/components/chat/ChatView";
import { AdminNewConversation } from "@/components/chat/AdminNewConversation";
import { PaymentGroundRules } from "@/components/support/PaymentGroundRules";

/**
 * Server-side "now" snapshot for the thread's day separators. Module-level so
 * the React Compiler purity lint stays quiet (the documented pattern).
 */
function nowSnapshot(): number {
  return Date.now();
}

/** Page copy for each audience — shared by /chat and the student dashboard. */
export function chatCopy(profile: Profile) {
  return profileIsAdmin(profile)
    ? {
        title: "Conversations with your students and tutors",
        subtitle:
          "Reach students and tutors directly — your messages are verified as Harcourt admin.",
      }
    : profile.role === "tutor"
      ? {
          title: "Conversations with your students",
          subtitle:
            "Students reach out when they find your profile. Chat here, then schedule sessions from your timetable.",
        }
      : {
          title: "Conversations with your tutors",
          subtitle: "Contact a tutor from the home page — your chat lives here.",
        };
}

/**
 * The messages screen without its page frame. Rendered by `/chat` (tutors and
 * admins, with their own header) and by `/dashboard/messages` (students,
 * inside the dashboard so its sidebar stays on screen). ChatView builds its
 * `?c=` links from the current pathname, so it works at either address.
 *
 * The active thread is picked from ?c= (falling back to the newest).
 */
export async function ChatScreen({
  profile,
  c,
}: {
  profile: Profile;
  c?: string;
}) {
  // ONE round instead of three. The conversation list, the admin targets and
  // the thread named by ?c= all start together; ?c= is exactly what the
  // "Contact tutor" action pushes, so the path a student actually takes to
  // reach a tutor never waits on the list to learn which thread to open.
  const [conversations, chatTargets, requestedThread] = await Promise.all([
    listConversationsForUser(profile),
    profileIsAdmin(profile) ? listChatTargetsForAdmin() : Promise.resolve([]),
    c ? getThreadForUser(c, profile) : Promise.resolve(null),
  ]);

  const activeId =
    c && conversations.some((conv) => conv.id === c)
      ? c
      : (conversations[0]?.id ?? null);

  // Round 2 only when the URL named nothing usable (plain /chat from the nav,
  // or a stale ?c= outside the list): the thread has to be picked from the
  // list first. Guarded on activeId === c so the open thread can never
  // disagree with the highlighted row.
  const requestedUsable = activeId != null && activeId === c;
  const thread =
    requestedUsable && requestedThread
      ? requestedThread
      : activeId
        ? await getThreadForUser(activeId, profile)
        : null;

  return (
    <div>
      {/* Payment reminder — students: only admins take payments; tutors: don't collect fees. */}
      {(profile.role === "student" || profile.role === "tutor") && (
        <PaymentGroundRules variant="banner" audience={profile.role} />
      )}

      {/* Admins start threads with students/tutors from here. */}
      {profileIsAdmin(profile) && <AdminNewConversation targets={chatTargets} />}

      {/* key remounts ChatView per conversation — fresh state, no cross-thread bleed. */}
      <ChatView
        key={activeId ?? "none"}
        conversations={conversations}
        activeId={activeId}
        thread={thread?.messages ?? []}
        otherName={thread?.otherName ?? ""}
        otherIsAdmin={thread?.otherIsAdmin ?? false}
        adminId={thread?.adminId ?? null}
        myId={profile.id}
        closed={thread?.status === "closed"}
        now={nowSnapshot()}
        isAdmin={profileIsAdmin(profile)}
      />
    </div>
  );
}
