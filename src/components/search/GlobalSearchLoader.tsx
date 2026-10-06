import { listCourses } from "@/services/courses/queries";
import { engineeringCourses } from "@/components/home/courseTaxonomy";
import { safeListApprovedTutors } from "@/services/tutors/queries";
import { GlobalSearch, type CourseHit, type TutorHit } from "./GlobalSearch";

/**
 * Server loader for the global search — fetches the (cached) course taxonomy
 * and approved-tutor list once and flattens them to the shapes the client
 * modal needs. Both reads degrade to an empty list on error, so a transient
 * DB failure hides search results instead of 500ing the page. Courses are
 * narrowed to the engineering fields, matching the public catalog.
 */
export async function GlobalSearchLoader() {
  const [allCourses, tutors] = await Promise.all([
    listCourses(),
    safeListApprovedTutors(),
  ]);
  const courses = engineeringCourses(allCourses);

  const courseHits: CourseHit[] = courses.map((c) => ({
    id: c.id,
    subject: c.subject,
    name: c.name,
    description: c.description,
  }));

  const tutorHits: TutorHit[] = tutors.map((t) => ({
    id: t.tutorProfile.id,
    name: t.profile.full_name ?? "Harcourt tutor",
    bio: t.tutorProfile.bio ?? "",
    qualifications: t.tutorProfile.qualifications ?? "",
    courses: t.courses.map((c) => `${c.name} ${c.subject}`).join(" "),
  }));

  return <GlobalSearch courses={courseHits} tutors={tutorHits} />;
}
