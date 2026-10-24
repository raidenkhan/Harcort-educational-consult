import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import { ServicePrice } from "@/components/tutors/ServicePrice";
import { TutorProfileForm } from "@/components/tutor/TutorProfileForm";
import { TutorServiceForm } from "@/components/tutor/TutorServiceForm";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { SmsPreferenceForm } from "@/components/auth/SmsPreferenceForm";
import { CopyProfileLink } from "@/components/tutor/CopyProfileLink";
import { Card } from "@/components/ui/Card";

/**
 * Overview tab — profile + course offerings. The verification gate on
 * scheduling/payments lives on the tabs that need it; this page is about
 * what students see.
 */
export default async function TutorOverviewPage() {
  const profile = await requireRole("tutor");

  const [tutor, courses] = await Promise.all([
    getOwnTutorProfile(),
    listCourses(),
  ]);

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-2">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">About you</h2>
        <TutorProfileForm
          initial={{
            bio: tutor.profile?.bio ?? "",
            qualifications: tutor.profile?.qualifications ?? "",
            ratePerSemester: tutor.profile?.rate_per_semester?.toString() ?? "",
          }}
        />
      </Card>

      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-slate-900">
            Courses you teach
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Add the courses you&apos;re willing to tutor, with your price per
            semester. Students request these directly.
          </p>
          <TutorServiceForm courses={courses} />
        </Card>

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

        <Card>
          <h2 className="text-lg font-semibold text-slate-900">
            Your services
          </h2>
          {tutor.services.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No courses added yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {tutor.services.map((service) => {
                return (
                  <li key={service.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        {service.course?.code && (
                          <span className="mr-2 font-mono text-xs text-slate-400">
                            {service.course.code}
                          </span>
                        )}
                        {service.course?.name ?? "Unknown course"}
                      </span>
                      {service.course?.is_approved === false && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          awaiting review
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <ServicePrice service={service} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
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
              straight from it.
            </p>
            <CopyProfileLink code={profile.public_code} />
          </Card>
        )}
      </div>
    </div>
  );
}


