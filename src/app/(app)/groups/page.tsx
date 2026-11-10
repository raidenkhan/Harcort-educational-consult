import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";
import { GroupsScreen, groupsSubtitle } from "@/components/groups/GroupsScreen";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";

/**
 * /groups — protected. Tutors and admins use it as a page of its own.
 * Students have their groups INSIDE the dashboard (/dashboard/groups), so
 * they are sent there — keeping ?g= and ?code= so shared join links and
 * notification links still land on the right group.
 */
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; code?: string }>;
}) {
  const profile = await requireProfile();
  const { g, code } = await searchParams;

  if (profile.role === "student") {
    const params = new URLSearchParams();
    if (g) params.set("g", g);
    if (code) params.set("code", code);
    const query = params.toString();
    redirect(query ? `/dashboard/groups?${query}` : "/dashboard/groups");
  }

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="purple" />
      <Container className="py-6 sm:py-12">
        <PageHeader title="Learn together" description={groupsSubtitle(profile)} />
        <div className="mt-8">
          <GroupsScreen profile={profile} g={g} code={code} />
        </div>
      </Container>
    </div>
  );
}
