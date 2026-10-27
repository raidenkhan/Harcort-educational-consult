import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { getTutorDashboard } from "@/services/tutors/dashboard";
import { TutorDashboard } from "@/components/tutor/TutorDashboard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Dashboard tab — the tutor's working overview.
 *
 * Students, lessons and money in one glance: who they teach, how much has
 * actually been collected, what is coming up, and which requests are waiting
 * for an answer. Everything editable (bio, photo, courses, phone, share links)
 * lives on `/tutor/settings`, so this page never reads like a settings screen.
 */
export default async function TutorOverviewPage() {
  const profile = await requireRole("tutor");
  const tutor = await getOwnTutorProfile();

  // A tutor who has not created the profile yet has nothing to dashboard —
  // send them straight to the one thing that unblocks students finding them.
  if (!tutor.profile) {
    return (
      <div className="mt-10">
        <Card className="max-w-xl">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-50">
            <GraduationCap className="h-5 w-5 text-brand-700" />
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900">
            Set up your tutor profile
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Tell students who you are, what you teach, and your semester price
            for each course. An admin reviews your profile before it goes live —
            after that, students can find and request you.
          </p>
          <Link href="/tutor/settings" className="mt-5 inline-block">
            <Button>Set up your profile</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const data = await getTutorDashboard(profile);
  return <TutorDashboard data={data} />;
}
