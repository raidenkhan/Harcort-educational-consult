import { requireProfile } from "@/services/auth/queries";
import {
  listConversationsForUser,
  listMessagesForConversation,
  getConversationMeta,
  listChatTargetsForAdmin,
} from "@/services/chat/queries";
import { ChatView } from "@/components/chat/ChatView";
import { AdminNewConversation } from "@/components/chat/AdminNewConversation";
import { Container } from "@/components/ui/Container";
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
    profile.role === "admin" ? listChatTargetsForAdmin() : Promise.resolve([]),
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
    profile.role === "admin"
      ? {
          title: "Conversations with your students and tutors",
          subtitle:
            "Reach students and tutors directly — your messages are verified as Harcot admin.",
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
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Messages
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
          {roleCopy.title}
        </h1>
        <p className="mt-2 max-w-xl text-slate-600">
          {profile.role === "admin" ? (
            <span className="inline-flex items-center gap-1.5">
              {roleCopy.subtitle}
              <VerifiedBadge className="align-[-1px]" />
            </span>
          ) : (
            roleCopy.subtitle
          )}
        </p>

        {/* Payment reminder — students: only admins take payments; tutors: don't collect fees. */}
        {(profile.role === "student" || profile.role === "tutor") && (
          <PaymentGroundRules
            variant="banner"
            audience={profile.role}
            className="mt-8"
          />
        )}

        {/* Admins start threads with students/tutors from here. */}
        {profile.role === "admin" && (
          <AdminNewConversation targets={chatTargets} />
        )}

        <ChatView
          conversations={conversations}
          activeId={activeId}
          thread={thread ?? []}
          otherName={meta?.otherName ?? ""}
          otherIsAdmin={meta?.otherIsAdmin ?? false}
          adminId={meta?.adminId ?? null}
          myId={profile.id}
          closed={meta?.status === "closed"}
          now={nowSnapshot()}
          initialThreadOpen={Boolean(c)}
          isAdmin={profile.role === "admin"}
        />
      </Container>
    </div>
  );
}
