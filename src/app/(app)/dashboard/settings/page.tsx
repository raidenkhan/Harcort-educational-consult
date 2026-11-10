import { requireProfile } from "@/services/auth/queries";
import { AccountSettings } from "@/components/auth/AccountSettings";
import { listCourses } from "@/services/courses/queries";
import { engineeringCourses, sortFields } from "@/components/home/courseTaxonomy";

/**
 * Student dashboard — Settings. Everything about the account rather than
 * anything the student does day to day — including their programme, which
 * decides what Dashboard → Courses shows.
 */
export default async function StudentSettingsPage() {
  const profile = await requireProfile();
  // The programmes a student can pick — the same list the Courses page
  // browses (the catalogue's subjects, department programmes first).
  const programs =
    profile.role === "student"
      ? sortFields(Array.from(new Set(engineeringCourses(await listCourses()).map((c) => c.subject))))
      : undefined;
  return <AccountSettings profile={profile} programs={programs} />;
}
