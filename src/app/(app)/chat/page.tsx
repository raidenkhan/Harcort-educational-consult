import { redirect } from "next/navigation";
import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import { ChatScreen, chatCopy } from "@/components/chat/ChatScreen";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";

/**
 * /chat — protected. Tutors and admins use it as a page of its own. Students
 * have their messages INSIDE the dashboard (/dashboard/messages, so the
 * dashboard menu stays on screen), so they are sent there — keeping ?c= so
 * every existing link (notifications, emails, "Contact tutor") still opens
 * the right thread.
 */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const profile = await requireProfile();
  const { c } = await searchParams;

  if (profile.role === "student") {
    redirect(c ? `/dashboard/messages?c=${encodeURIComponent(c)}` : "/dashboard/messages");
  }

  const copy = chatCopy(profile);

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-6 sm:py-12">
        <PageHeader
          title={copy.title}
          description={
            profileIsAdmin(profile) ? (
              <span className="inline-flex items-center gap-1.5">
                {copy.subtitle}
                <VerifiedBadge className="align-[-1px]" />
              </span>
            ) : (
              copy.subtitle
            )
          }
        />
        <div className="mt-8">
          <ChatScreen profile={profile} c={c} />
        </div>
      </Container>
    </div>
  );
}
