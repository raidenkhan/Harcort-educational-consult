import { requireRole } from "@/services/auth/queries";
import {
  listAllCourseAssets,
  listCourses,
  listPendingCourses,
} from "@/services/courses/queries";
import { CourseCatalogueManager } from "@/components/admin/CourseCatalogueManager";
import { CourseLibraryConsole } from "@/components/admin/CourseLibraryConsole";
import { AdminSection } from "@/components/admin/AdminSection";
import { courseUsageCounts } from "@/services/admin/queries";
import { sortFields } from "@/components/home/courseTaxonomy";
import { PendingCoursesPanel } from "@/components/admin/PendingCoursesPanel";

/**
 * Courses tab, top to bottom: the course catalogue (add / delete courses,
 * paged), the course library (one card — pick a course, then its materials
 * and videos with Add buttons that open modals), and the queue of courses
 * tutors added that are waiting for approval.
 */
export default async function AdminCoursesPage() {
  await requireRole("admin");

  const [courses, assets, pending, usage] = await Promise.all([
    listCourses(),
    listAllCourseAssets(),
    listPendingCourses(),
    courseUsageCounts(),
  ]);
  const programmes = sortFields(Array.from(new Set(courses.map((c) => c.subject))));

  return (
    <>
      <AdminSection
        title="Course catalogue"
        description="Add a course to any programme, or delete one. A course with bookings can't be deleted."
      >
        <CourseCatalogueManager
          programmes={programmes}
          courses={courses.map((c) => ({
            id: c.id,
            subject: c.subject,
            code: c.code ?? null,
            name: c.name,
            credits: c.credits ?? null,
            year: c.year ?? null,
            semester: c.semester ?? null,
            offers: usage.offers[c.id] ?? 0,
            bookings: usage.bookings[c.id] ?? 0,
          }))}
        />
      </AdminSection>

      {/* The course library — everything on one card, before the tutor-added
          course queue. */}
      <AdminSection
        title="Course library"
        description="Notes and tutorial videos for each course. They appear on the course's public page as soon as you add them."
      >
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
      </AdminSection>

      <PendingCoursesPanel courses={pending} />

    </>
  );
}
