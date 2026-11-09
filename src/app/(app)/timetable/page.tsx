import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";

/**
 * Role-aware door to "your timetable". A session notification can go to
 * either side of a booking, and tutors and students keep their timetables in
 * different places — so notifications link here and this sends each person to
 * their own.
 */
export default async function TimetableRedirect() {
  const profile = await requireProfile("/timetable");
  redirect(profile.role === "tutor" ? "/tutor/timetable" : "/dashboard/timetable");
}
