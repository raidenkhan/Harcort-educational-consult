import { requireProfile } from "@/services/auth/queries";
import {
  listConversationsForUser,
  listMessagesForConversation,
  getConversationMeta,
} from "@/services/chat/queries";
import { ChatView } from "@/components/chat/ChatView";
import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { PaymentGroundRules } from "@/components/support/PaymentGroundRules";

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

  const conversations = await listConversationsForUser();

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

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Messages
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
          Conversations with your{" "}
          {profile.role === "tutor" ? "students" : "tutors"}
        </h1>
        <p className="mt-2 max-w-xl text-slate-600">
          {profile.role === "tutor"
            ? "Students reach out when they find your profile. Chat here, then schedule sessions from your timetable."
            : "Contact a tutor from the home page — your chat lives here."}
        </p>

        {/* Payment reminder for students — payments happen with admins only. */}
        {profile.role === "student" && (
          <PaymentGroundRules variant="banner" className="mt-8" />
        )}

        <ChatView
          conversations={conversations}
          activeId={activeId}
          thread={thread ?? []}
          otherName={meta?.otherName ?? ""}
          myId={profile.id}
          closed={meta?.status === "closed"}
        />
      </Container>
    </div>
  );
}
