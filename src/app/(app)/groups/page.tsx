import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import {
  getGroupMeta,
  listGroupMembers,
  listGroupMessages,
  listMyGroupsForUser,
} from "@/services/groups/queries";
import { listCourses } from "@/services/courses/queries";
import { engineeringCourses } from "@/components/home/courseTaxonomy";
import { GroupsView } from "@/components/groups/GroupsView";
import { JoinGroupForm } from "@/components/groups/JoinGroupForm";
import { CreateGroupForm } from "@/components/groups/CreateGroupForm";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";

/**
 * Server-side "now" snapshot for the feed's day separators. Module-level so
 * the React Compiler purity lint stays quiet (the documented pattern).
 */
function nowSnapshot(): number {
  return Date.now();
}

/**
 * /groups — protected. The active group is picked from ?g= (falling back to
 * the newest group). Page-level requireProfile is the authoritative guard.
 */
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const profile = await requireProfile();
  const { g } = await searchParams;
  const canCreate = profile.role === "tutor" || profileIsAdmin(profile);

  const [groups, allCourses] = await Promise.all([
    listMyGroupsForUser(),
    canCreate ? listCourses() : Promise.resolve([]),
  ]);

  const activeId =
    g && groups.some((group) => group.id === g) ? g : (groups[0]?.id ?? null);

  const [thread, meta, members] = activeId
    ? await Promise.all([
        listGroupMessages(activeId, profile),
        getGroupMeta(activeId, profile),
        listGroupMembers(activeId, profile),
      ])
    : [null, null, null];

  const courseOptions = engineeringCourses(allCourses).map((course) => ({
    id: course.id,
    name: course.name,
  }));

  const subtitle = canCreate
    ? "Create a room for one of your courses, share the code, and keep your students in sync."
    : "Join a group with the code your tutor shared and study together.";

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="purple" />
      <Container className="py-6 sm:py-12">
        <PageHeader title="Learn together" description={subtitle} />

        <Card className="mt-8">
          <JoinGroupForm />
        </Card>

        {canCreate && <CreateGroupForm courses={courseOptions} />}

        <GroupsView
          key={activeId ?? "none"}
          groups={groups}
          activeId={activeId}
          thread={thread ?? []}
          meta={meta}
          members={members ?? []}
          myId={profile.id}
          now={nowSnapshot()}
        />
      </Container>
    </div>
  );
}
