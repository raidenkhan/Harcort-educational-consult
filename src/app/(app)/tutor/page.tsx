import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import { TutorProfileCard } from "@/components/tutor/TutorProfileCard";
import { TutorCoursesManager } from "@/components/tutor/TutorCoursesManager";
import { TutorPaymentsCard } from "@/components/payments/TutorPaymentsCard";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { SmsPreferenceForm } from "@/components/auth/SmsPreferenceForm";
import { CopyProfileLink } from "@/components/tutor/CopyProfileLink";
import { tutorSharePath } from "@/services/tutors/share";
import { Card } from "@/components/ui/Card";

/**
 * Overview tab — payments, profile and course offerings.
 *
 * Payments lead: a student paying confirms the booking on its own, so the
 * tutor must be able to see "who paid me, for what" at a glance instead of
 * opening the Earnings tab. The verification gate on scheduling/payments
 * lives on the tabs that need it; this page is about what students see.
 */
export default async function TutorOverviewPage() {
  const profile = await requireRole("tutor");

  const [tutor, courses] = await Promise.all([
    getOwnTutorProfile(),
    listCourses(),
  ]);

  return (
    <div className="mt-10 space-y-8">
      <TutorPaymentsCard />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <TutorProfileCard
          name={profile.full_name}
          avatarUrl={profile.avatar_url ?? null}
          status={tutor.profile?.verification_status ?? null}
          bio={tutor.profile?.bio ?? null}
          qualifications={tutor.profile?.qualifications ?? null}
        />

        <div className="space-y-6">
          <TutorCoursesManager
            courses={courses}
            services={tutor.services}
            publicCode={profile.public_code ?? null}
          />

          <Card>
            <h2 className="text-lg font-semibold text-slate-900">
              Phone number &amp; text alerts
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              We text you when a student requests you, when a session is coming
              up, and when a session is cancelled. Add your number here — without
              it, those alerts only reach your email.
            </p>
            <div className="mt-3">
              <PhoneForm key={profile.phone ?? "none"} current={profile.phone} />
            </div>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <SmsPreferenceForm optedOut={profile.sms_opt_out ?? false} />
            </div>
          </Card>

          {/* 0031 — the tutor's shareable profile link. */}
          {profile.public_code && (
            <Card>
              <h2 className="text-lg font-semibold text-slate-900">
                Your profile link
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Send this to any student — it opens your public profile with
                your credentials and semester rates, and they can request you
                straight from it. For one course, copy that course&apos;s own
                link from <span className="font-medium">Your services</span>{" "}
                above: the student lands on that offering with the request
                already set to it.
              </p>
              <CopyProfileLink
                code={profile.public_code}
                path={tutorSharePath(profile.public_code)}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}


