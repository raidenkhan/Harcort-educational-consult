import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { Badge } from "@/components/ui/Badge";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { TutorTabs } from "@/components/tutor/TutorTabs";

/**
 * Tutor hub shell — shared header + section tabs. Each tab is its own route
 * (`/tutor`, `/tutor/timetable`, `/tutor/students`, `/tutor/earnings`) and
 * fetches only what it shows, replacing the old single long dashboard.
 */
export default async function TutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("tutor");
  const tutor = await getOwnTutorProfile();

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="purple" />
      {/* Wide: the timetable tab's calendar views (a 7-column month grid and
          a 7-day timeline) need the extra room the default container denies
          them. */}
      <Container size="wide" className="py-12">
        <PageHeader title="Tutor hub" />

        {tutor.profile && (
          <div className="mt-4">
            <Badge
              tone={
                tutor.profile.verification_status === "approved"
                  ? "green"
                  : tutor.profile.verification_status === "rejected"
                    ? "red"
                    : "amber"
              }
            >
              {tutor.profile.verification_status === "approved"
                ? "Approved — visible to students"
                : tutor.profile.verification_status === "rejected"
                  ? "Not approved — see admin note"
                  : "Under review"}
            </Badge>
            {tutor.profile.admin_notes && (
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-semibold">Admin note:</span>{" "}
                {tutor.profile.admin_notes}
              </p>
            )}
          </div>
        )}

        <TutorTabs />

        {children}
      </Container>
    </div>
  );
}
