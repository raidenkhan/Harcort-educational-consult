import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import { TutorProfileForm } from "@/components/tutor/TutorProfileForm";
import { TutorServiceForm } from "@/components/tutor/TutorServiceForm";
import { PhoneForm } from "@/components/auth/PhoneForm";
import { SmsPreferenceForm } from "@/components/auth/SmsPreferenceForm";
import { Card } from "@/components/ui/Card";
import type { TutorService } from "@/types";

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
            ratePerHour: tutor.profile?.rate_per_hour?.toString() ?? "",
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
              {tutor.services.map((service: TutorService) => (
                <li
                  key={service.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="font-medium text-slate-800">
                    {courseName(courses, service.course_id)}
                  </span>
                  <span className="font-semibold text-slate-900">
                    GH₵{service.price.toLocaleString()}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      /semester
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function courseName(courses: { id: string; name: string }[], courseId: string) {
  return courses.find((c) => c.id === courseId)?.name ?? "Unknown course";
}
