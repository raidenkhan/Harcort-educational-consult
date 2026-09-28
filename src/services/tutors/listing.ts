import type { Course, Profile, TutorProfile, TutorService } from "@/types";

/**
 * Pure mapping of raw `tutor_profiles` rows (with embedded `profiles` and
 * `tutor_services(*, courses(*))`) into the public TutorListing shape.
 *
 * Kept pure and unit-tested because PostgREST has a trap here: when a query
 * filters on an embedded relation (`.neq("profiles.role", "student")`), rows
 * whose embed FAILS the filter are kept but their embed is nulled — e.g. a
 * tutor who self-switched to student (role switcher) still has an approved
 * tutor_profiles row, and it comes back as `{ ...profiles: null }`. Rendering
 * such a row as-is crashes every consumer that reads `profile.full_name`
 * (this 500'd the landing page and /tutors in production). Rows without a
 * usable profile embed are therefore dropped here, never mapped.
 */

export interface TutorListing {
  tutorProfile: TutorProfile;
  profile: Profile;
  services: TutorService[];
  courses: Course[];
}

/** PostgREST returns to-one embeds as an object — or a single-element array
 *  under some relation shapes — and null when a filter removed the target. */
function unwrapEmbed<T>(embed: T | T[] | null | undefined): T | null {
  if (embed == null) return null;
  if (Array.isArray(embed)) return (embed[0] as T) ?? null;
  return embed;
}

export interface TutorProfileRow extends TutorProfile {
  profiles: Profile | Profile[] | null;
  tutor_services:
    | (TutorService & { courses: Course | Course[] | null })[]
    | null;
}

export function toTutorListings(rows: TutorProfileRow[]): TutorListing[] {
  const listings: TutorListing[] = [];

  for (const row of rows) {
    const profile = unwrapEmbed(row.profiles);
    if (!profile) continue; // embed filtered out (or profile gone) — skip

    const services = (row.tutor_services ?? [])
      .map((s) => {
        const course = unwrapEmbed(s.courses);
        return course
          ? {
              id: s.id,
              tutor_profile_id: s.tutor_profile_id,
              course_id: s.course_id,
              price: s.price,
              description: s.description,
              created_at: s.created_at,
            }
          : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    listings.push({
      tutorProfile: {
        id: row.id,
        profile_id: row.profile_id,
        bio: row.bio,
        qualifications: row.qualifications,
        rate_per_hour: row.rate_per_hour,
        verification_status: row.verification_status,
        admin_notes: row.admin_notes,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
      profile,
      services,
      courses: (row.tutor_services ?? [])
        .map((s) => unwrapEmbed(s.courses))
        .filter((c): c is Course => c !== null),
    });
  }

  return listings;
}
