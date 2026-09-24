import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import { TutorProfileForm } from "@/components/tutor/TutorProfileForm";
import { TutorServiceForm } from "@/components/tutor/TutorServiceForm";
import { Card } from "@/components/ui/Card";
import type { TutorService } from "@/types";

/**
 * Overview tab — profile + course offerings. The verification gate on
 * scheduling/payments lives on the tabs that need it; this page is about
 * what students see.
 */
export default async function TutorOverviewPage() {
  await requireRole("tutor");

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
            hour. Students request these directly.
          </p>
          <TutorServiceForm courses={courses} />
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
                      /hr
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
