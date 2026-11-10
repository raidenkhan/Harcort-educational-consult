import { requireRole } from "@/services/auth/queries";
import {
  listApprovedTutorsForAdmin,
  listPendingTutors,
  listPlatformPeople,
  listTutorsForAdmin,
} from "@/services/admin/queries";
import { TutorManager } from "@/components/admin/TutorManager";
import { TutorApplications } from "@/components/admin/TutorApplications";
import { Badge } from "@/components/ui/Badge";
import { AdminSection } from "@/components/admin/AdminSection";
import { AdminResetCode } from "@/components/admin/AdminResetCode";
import { ReportsQueue } from "@/components/admin/ReportsQueue";
import { PeopleDirectory } from "@/components/admin/PeopleDirectory";
import { accraDate } from "@/lib/time";

/**
 * People tab — everything about accounts: the directory of every student and
 * tutor (Show dropdown + search), tutor applications to approve or
 * reject (moved off Overview, which is numbers only now), admin-issued
 * password reset codes and the reports queue (both from the old Support tab).
 */
export default async function AdminPeoplePage() {
  await requireRole("admin");

  const [pending, approvedCount, people, tutors] = await Promise.all([
    listPendingTutors(),
    listApprovedTutorsForAdmin(),
    listPlatformPeople(),
    listTutorsForAdmin(),
  ]);

  return (
    <div>
      <AdminSection
        title="Students & tutors"
        description="Everyone on the platform. Pick who to show, or search by name, code or email."
      >
        <PeopleDirectory
          people={people.map((person) => ({
            ...person,
            joinedLabel: accraDate(new Date(person.joinedAt)),
          }))}
        />
      </AdminSection>

      <AdminSection
        title="Tutors"
        description="Add a tutor (approved straight away), remove one from the directory, or delete a tutor who has no bookings."
      >
        <TutorManager
          tutors={tutors.map((t) => ({ ...t, joinedLabel: accraDate(new Date(t.joinedAt)) }))}
        />
      </AdminSection>

      <AdminSection
        title="Tutor applications"
        description="New tutors stay off the public directory until you approve them. Approve or reject each one — a message to the tutor is optional."
        actions={
          <>
            <Badge tone="amber">{pending.length} pending</Badge>
            <Badge tone="green">{approvedCount} approved</Badge>
          </>
        }
      >
        <TutorApplications
          applications={pending.map((tutor) => ({
            id: tutor.id,
            name: tutor.full_name || "Unnamed tutor",
            publicCode: tutor.public_code,
            appliedLabel: accraDate(new Date(tutor.created_at)),
            bio: tutor.bio,
          }))}
        />
      </AdminSection>

      <AdminSection
        title="Password resets"
        description={
          <>
            Self-service reset lives at /forgot-password. These admin-issued
            codes are the fallback for accounts whose email doesn&apos;t work —
            the code is hashed at rest, single-use, and expires in 30 minutes.
          </>
        }
      >
        <AdminResetCode />
      </AdminSection>

      <ReportsQueue />
    </div>
  );
}
