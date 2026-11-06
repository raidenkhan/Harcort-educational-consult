import type { TutorListing } from "@/services/tutors/listing";
import type { CartOffering } from "@/components/cart/AddToCartButton";
import { formatPrices } from "@/services/tutors/pricing";
import { normalizeCourseCode } from "./codes";

/**
 * Which tutors can be added to the cart for each directory course.
 *
 * Matched by NORMALISED CODE, not course id: 0030 seeds shared courses once
 * per programme, so "ME 261" has several `courses` rows and a tutor who
 * listed it under Mechanical must still show up when a Marine student opens
 * Marine's ME 261 (see AGENTS.md, "One real course can have SEVERAL rows").
 * Courses without a code fall back to an exact id match.
 *
 * The offering keeps the TUTOR's own course id/name — that is the
 * `tutor_services` row checkout prices — so the cart line names the course
 * the tutor actually teaches. Pure, so it is unit-tested.
 */
export function offeringsByCourse(
  tutors: readonly TutorListing[],
  courses: readonly { id: string; code?: string | null }[],
): Record<string, CartOffering[]> {
  const byCode = new Map<string, CartOffering[]>();
  const byId = new Map<string, CartOffering[]>();

  for (const tutor of tutors) {
    const courseById = new Map(tutor.courses.map((c) => [c.id, c]));
    for (const service of tutor.services) {
      const course = courseById.get(service.course_id);
      if (!course) continue;
      const prices = formatPrices(service);
      if (prices.oneOnOne === null && prices.group === null) continue;

      const offering: CartOffering = {
        tutorServiceId: service.id,
        tutorProfileId: tutor.tutorProfile.id,
        tutorName: tutor.profile.full_name || "Harcourt tutor",
        tutorCode: tutor.profile.public_code ?? null,
        courseId: course.id,
        courseName: course.name,
        courseCode: course.code ?? null,
        priceOneOnOne: prices.oneOnOne,
        priceGroup: prices.group,
      };

      const code = normalizeCourseCode(course.code);
      const bucket = code ? byCode : byId;
      const key = code || course.id;
      const list = bucket.get(key) ?? [];
      list.push(offering);
      bucket.set(key, list);
    }
  }

  const result: Record<string, CartOffering[]> = {};
  for (const course of courses) {
    const code = normalizeCourseCode(course.code);
    const found = code ? byCode.get(code) : byId.get(course.id);
    if (found && found.length > 0) result[course.id] = found;
  }
  return result;
}
