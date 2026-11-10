import { requireProfile } from "@/services/auth/queries";
import { GroupsScreen } from "@/components/groups/GroupsScreen";

/**
 * Dashboard → Groups: the student's study groups, inside the dashboard so
 * the sidebar stays on screen. Students reaching /groups are redirected here
 * with ?g= / ?code= intact.
 */
export default async function DashboardGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; code?: string }>;
}) {
  const profile = await requireProfile();
  const { g, code } = await searchParams;
  return <GroupsScreen profile={profile} g={g} code={code} />;
}
