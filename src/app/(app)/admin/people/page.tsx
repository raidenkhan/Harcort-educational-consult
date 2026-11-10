import { requireRole } from "@/services/auth/queries";
import {
  listApprovedTutorsForAdmin,
  listPendingTutors,
  listPlatformPeople,
  listTutorsForAdmin,
} from "@/services/admin/queries";
import { TutorManager } from "@/components/admin/TutorManager";
import { approveTutor, rejectTutor } from "@/services/admin/mutations";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Fields";
import { AdminEmpty, AdminSection } from "@/components/admin/AdminSection";
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
        description="New tutors stay off the public directory until you approve them. A rejection needs a reason — the tutor sees it."
        actions={
          <>
            <Badge tone="amber">{pending.length} pending</Badge>
            <Badge tone="green">{approvedCount} approved</Badge>
          </>
        }
      >
        {pending.length === 0 ? (
          <AdminEmpty>
            No pending applications. New tutor sign-ups will appear here for
            review.
          </AdminEmpty>
        ) : (
          <ul className="space-y-4">
            {pending.map((tutor) => (
              <li key={tutor.id}>
                <Card className="flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-0 max-w-xl flex-1">
                    <h3 className="text-lg font-semibold text-slate-900">
                      {tutor.full_name || "Unnamed tutor"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {tutor.public_code && (
                        <span
                          className="mr-2 font-mono text-xs text-slate-400"
                          title="Harcourt tracking code — quote this in support conversations"
                        >
                          {tutor.public_code}
                        </span>
                      )}
                      Applied {accraDate(new Date(tutor.created_at))}
                      {/* Tutors price each course now; the profile-wide rate
                          is legacy (pre-0031), so show it only if set. */}
                      {tutor.rate_per_semester != null &&
                        ` · GH₵${tutor.rate_per_semester.toLocaleString()}/semester`}
                    </p>
                    {tutor.bio && (
                      <p className="mt-3 text-sm leading-relaxed text-slate-600">
                        {tutor.bio}
                      </p>
                    )}
                  </div>

                  <div className="w-full max-w-xs space-y-3 sm:w-72">
                    <form action={approveTutor} className="space-y-2">
                      <input
                        type="hidden"
                        name="tutorProfileId"
                        value={tutor.id}
                      />
                      <Input
                        name="note"
                        type="text"
                        placeholder="Note (optional, shown to tutor)"
                      />
                      <button
                        type="submit"
                        className="h-10 w-full rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700"
                      >
                        Approve tutor
                      </button>
                    </form>
                    <form action={rejectTutor} className="space-y-2">
                      <input
                        type="hidden"
                        name="tutorProfileId"
                        value={tutor.id}
                      />
                      <Input
                        name="note"
                        type="text"
                        required
                        placeholder="Reason for rejection (required)"
                        className="focus:border-red-400 focus:ring-red-100"
                      />
                      <button
                        type="submit"
                        className="h-10 w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs transition hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        Reject tutor
                      </button>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
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
