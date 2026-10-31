import { requireRole, profileIsAdmin } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import { TutorProfileCard } from "@/components/tutor/TutorProfileCard";
import { TutorCoursesManager } from "@/components/tutor/TutorCoursesManager";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { SmsPreferenceForm } from "@/components/auth/SmsPreferenceForm";
import { RoleSwitcher } from "@/components/auth/RoleSwitcher";
import { CopyProfileLink } from "@/components/tutor/CopyProfileLink";
import { tutorSharePath } from "@/services/tutors/share";
import { Card } from "@/components/ui/Card";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { accraDate } from "@/lib/time";

/**
 * Settings tab — everything that changes how students see the tutor, or how
 * Harcourt reaches them. It used to crowd the Overview page, which made the
 * tutor hub read like an account form; the dashboard now keeps only what a
 * tutor needs to act on, and the editing lives here, one deliberate click away.
 *
 * The account card and the role switch moved here from `/dashboard` when the
 * tutor's dashboard became `/tutor` — they are settings, not something a tutor
 * works from every day.
 */
export default async function TutorSettingsPage() {
  const profile = await requireRole("tutor");

  const [tutor, courses] = await Promise.all([
    getOwnTutorProfile(),
    listCourses(),
  ]);

  return (
    <section className="mt-10 space-y-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <TutorProfileCard
            name={profile.full_name}
            avatarUrl={profile.avatar_url ?? null}
            status={tutor.profile?.verification_status ?? null}
            bio={tutor.profile?.bio ?? null}
            qualifications={tutor.profile?.qualifications ?? null}
          />

          {/* 0031 — the tutor's shareable profile link. */}
          {profile.public_code && (
            <Card>
              <h3 className="text-lg font-semibold text-slate-900">
                Your profile link
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Send this to any student — it opens your public profile with
                your credentials and semester rates, and they can request you
                straight from it. For one course, copy that course&apos;s own
                link from <span className="font-medium">Your services</span>{" "}
                beside it: the student lands on that offering with the request
                already set to it.
              </p>
              <CopyProfileLink
                code={profile.public_code}
                path={tutorSharePath(profile.public_code)}
              />
            </Card>
          )}

          <Card>
            <h3 className="text-lg font-semibold text-slate-900">Account</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Role</dt>
                <dd className="flex items-center gap-1.5 font-medium capitalize text-slate-900">
                  {profile.role}
                  {profileIsAdmin(profile) && <VerifiedBadge />}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Name</dt>
                <dd className="text-right font-medium text-slate-900">
                  {profile.full_name}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-slate-500">Member since</dt>
                <dd className="font-medium text-slate-900">
                  {accraDate(new Date(profile.created_at))}
                </dd>
              </div>
            </dl>
          </Card>

          <RoleSwitcher currentRole="tutor" />
        </div>

        <div className="space-y-6">
          <TutorCoursesManager
            courses={courses}
            services={tutor.services}
            publicCode={profile.public_code ?? null}
          />

          <Card>
            <h3 className="text-lg font-semibold text-slate-900">
              Phone number &amp; text alerts
            </h3>
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
        </div>
      </div>
    </section>
  );
}
