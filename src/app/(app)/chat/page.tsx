import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import {
  listConversationsForUser,
  listMessagesForConversation,
  getConversationMeta,
  listChatTargetsForAdmin,
} from "@/services/chat/queries";
import { ChatView } from "@/components/chat/ChatView";
import { AdminNewConversation } from "@/components/chat/AdminNewConversation";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { PaymentGroundRules } from "@/components/support/PaymentGroundRules";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";

/**
 * Server-side "now" snapshot for the thread's day separators.
 * Module-level so the React Compiler purity lint stays quiet (the documented
 * pattern — see splitTimetable in dashboard/page.tsx).
 */
function nowSnapshot(): number {
  return Date.now();
}

/**
 * /chat — protected. The active thread is picked from ?c= (falling back to
 * the newest conversation). Page-level requireProfile is the authoritative
 * guard; the middleware cookie check is just the cheap first line.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const profile = await requireProfile();
  const { c } = await searchParams;

  const [conversations, chatTargets] = await Promise.all([
    listConversationsForUser(),
    profileIsAdmin(profile) ? listChatTargetsForAdmin() : Promise.resolve([]),
  ]);

  const activeId =
    c && conversations.some((conv) => conv.id === c)
      ? c
      : (conversations[0]?.id ?? null);

  const [thread, meta] = activeId
    ? await Promise.all([
        listMessagesForConversation(activeId, profile),
        getConversationMeta(activeId, profile),
      ])
    : [null, null];

  const roleCopy =
    profileIsAdmin(profile)
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
            subtitle:
              "Contact a tutor from the home page — your chat lives here.",
          };

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <PageHeader
          title={roleCopy.title}
          description={
            profileIsAdmin(profile) ? (
              <span className="inline-flex items-center gap-1.5">
                {roleCopy.subtitle}
                <VerifiedBadge className="align-[-1px]" />
              </span>
            ) : (
              roleCopy.subtitle
            )
          }
        />

        {/* Payment reminder — students: only admins take payments; tutors: don't collect fees. */}
        {(profile.role === "student" || profile.role === "tutor") && (
          <PaymentGroundRules
            variant="banner"
            audience={profile.role}
            className="mt-8"
          />
        )}

        {/* Admins start threads with students/tutors from here. */}
        {profileIsAdmin(profile) && (
          <AdminNewConversation targets={chatTargets} />
        )}

        {/* key remounts ChatView per conversation — fresh state, no cross-thread bleed. */}
        <ChatView
          key={activeId ?? "none"}
          conversations={conversations}
          activeId={activeId}
          thread={thread ?? []}
          otherName={meta?.otherName ?? ""}
          otherIsAdmin={meta?.otherIsAdmin ?? false}
          adminId={meta?.adminId ?? null}
          myId={profile.id}
          closed={meta?.status === "closed"}
          now={nowSnapshot()}
          isAdmin={profileIsAdmin(profile)}
        />
      </Container>
    </div>
  );
}
