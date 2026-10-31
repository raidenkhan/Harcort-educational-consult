import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import {
  getGroupMeta,
  listGroupMembers,
  listGroupMessages,
  listJoinableGroupsForStudent,
  listMyGroupsForUser,
} from "@/services/groups/queries";
import { listTutorRoster } from "@/services/tutors/roster";
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
 *
 * The workspace comes FIRST (0036): a student who was added to a group should
 * land on the conversation, not on a "join with a code" form they never
 * needed. Joining and creating live below it.
 */
export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; code?: string }>;
}) {
  const profile = await requireProfile();
  const { g, code } = await searchParams;
  const canCreate = profile.role === "tutor" || profileIsAdmin(profile);
  const isTutor = profile.role === "tutor";

  const [groups, allCourses, suggested, rosterEntries] = await Promise.all([
    listMyGroupsForUser(),
    canCreate ? listCourses() : Promise.resolve([]),
    listJoinableGroupsForStudent(profile),
    isTutor ? listTutorRoster(profile) : Promise.resolve([]),
  ]);

  // One row per student (the roster already dedupes, but a Map makes that a
  // guarantee rather than a hope).
  const roster = [
    ...new Map(
      rosterEntries.map((entry) => [
        entry.studentId,
        { id: entry.studentId, name: entry.studentName },
      ]),
    ).values(),
  ];

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
    ? "Add the students you already teach, share the code, and keep everyone in sync."
    : "Groups your tutors add you to appear here — join with a code or in one tap.";

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="purple" />
      <Container className="py-6 sm:py-12">
        <PageHeader title="Learn together" description={subtitle} />

        <GroupsView
          key={activeId ?? "none"}
          groups={groups}
          activeId={activeId}
          thread={thread ?? []}
          meta={meta}
          members={members ?? []}
          myId={profile.id}
          now={nowSnapshot()}
          suggested={suggested}
          roster={roster}
          canCreate={canCreate}
        />

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Tutors create first — joining a group with a code is the
              student's path, and a tutor reaching this page usually wants the
              creator. */}
          {canCreate && <CreateGroupForm courses={courseOptions} />}

          <Card>
            <JoinGroupForm initialCode={code} />
          </Card>
        </div>
      </Container>
    </div>
  );
}
