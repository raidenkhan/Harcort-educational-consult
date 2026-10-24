import { requireRole } from "@/services/auth/queries";
import {
  listAllCourseAssets,
  listCourses,
  listPendingCourses,
} from "@/services/courses/queries";
import { CourseLibraryConsole } from "@/components/admin/CourseLibraryConsole";
import { PendingCoursesPanel } from "@/components/admin/PendingCoursesPanel";

/**
 * Courses tab — the course-library console: attach materials and tutorial
 * videos to a course, and review what's already published on the public
 * /courses/[id] pages. The tutor-added course queue sits above it (0031).
 */
export default async function AdminCoursesPage() {
  await requireRole("admin");

  const [courses, assets, pending] = await Promise.all([
    listCourses(),
    listAllCourseAssets(),
    listPendingCourses(),
  ]);

  return (
    <>
      <PendingCoursesPanel courses={pending} />

      <p className="mt-10 max-w-2xl text-sm leading-relaxed text-slate-600">
        Everything here is public — it appears on the course&apos;s page the
        moment you save it. Materials open the file link you provide; videos
        play inline from YouTube.
      </p>
      <CourseLibraryConsole
        courses={courses.map((course) => ({
          id: course.id,
          subject: course.subject,
          name: course.name,
          year: course.year,
        }))}
        materials={assets.materials}
        videos={assets.videos}
      />
    </>
  );
}
