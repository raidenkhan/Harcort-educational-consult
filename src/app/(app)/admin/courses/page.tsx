import { requireRole } from "@/services/auth/queries";
import { listAllCourseAssets, listCourses } from "@/services/courses/queries";
import { CourseLibraryConsole } from "@/components/admin/CourseLibraryConsole";

/**
 * Courses tab — the course-library console: attach materials and tutorial
 * videos to a course, and review what's already published on the public
 * /courses/[id] pages.
 */
export default async function AdminCoursesPage() {
  await requireRole("admin");

  const [courses, assets] = await Promise.all([
    listCourses(),
    listAllCourseAssets(),
  ]);

  return (
    <>
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-slate-600">
        Everything here is public — it appears on the course&apos;s page the
        moment you save it. Materials open the file link you provide; videos
        play inline from YouTube.
      </p>
      <CourseLibraryConsole
        courses={courses.map((course) => ({
          id: course.id,
          subject: course.subject,
          name: course.name,
        }))}
        materials={assets.materials}
        videos={assets.videos}
      />
    </>
  );
}
