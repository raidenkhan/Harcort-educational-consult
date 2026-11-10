import { requireProfile } from "@/services/auth/queries";
import { ChatScreen } from "@/components/chat/ChatScreen";

/**
 * Dashboard → Messages: the student's chats, inside the dashboard so the
 * sidebar stays on screen (the heading comes from StudentHeader). Students
 * reaching /chat are redirected here with their ?c= intact.
 */
export default async function DashboardMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const profile = await requireProfile();
  const { c } = await searchParams;
  return <ChatScreen profile={profile} c={c} />;
}
