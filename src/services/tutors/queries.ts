import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/services/auth/queries";
import type { Course, Profile, TutorProfile, TutorService } from "@/types";

/**
 * Tutor queries.
 * All reads run through the server-only service-role client and scope
 * explicitly (public read = only approved tutors; private read = own rows).
 */

export interface TutorListing {
  tutorProfile: TutorProfile;
  profile: Profile;
  services: TutorService[];
  courses: Course[];
}

interface TutorProfileRow extends TutorProfile {
  profiles: Profile | Profile[];
  tutor_services: TutorService[] | null;
}

interface ServiceRow extends TutorService {
  courses: Course;
}

/**
 * Approved tutors for the public landing page.
 *
 * Cached after the first real request (5 min TTL) — the page reads from cache
 * instead of hitting Supabase on every visit. Admin approve/reject calls
 * revalidateTag("tutors") so changes show up immediately.
 */
export const listApprovedTutors = unstable_cache(
  async (): Promise<TutorListing[]> => {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from("tutor_profiles")
      .select("*, profiles(*), tutor_services(*, courses(*))")
      .eq("verification_status", "approved")
      .order("created_at", { ascending: false });

    return (data ?? []).map((row: TutorProfileRow) => {
      const services = (row.tutor_services ?? []) as ServiceRow[];
      return {
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
        profile: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
        services: services.map((s) => ({
          id: s.id,
          tutor_profile_id: s.tutor_profile_id,
          course_id: s.course_id,
          price: s.price,
          description: s.description,
          created_at: s.created_at,
        })),
        courses: services.map((s) => s.courses).filter(Boolean),
      };
    });
  },
  ["approved-tutors"],
  { revalidate: 300, tags: ["tutors"] },
);

export async function getOwnTutorProfile(): Promise<{
  profile: TutorProfile | null;
  services: TutorService[];
}> {
  const supabase = createAdminClient();
  const current = await getCurrentProfile();
  if (!current) return { profile: null, services: [] };

  const { data: profile } = await supabase
    .from("tutor_profiles")
    .select("*")
    .eq("profile_id", current.id)
    .maybeSingle();

  const { data: services } = profile
    ? await supabase
        .from("tutor_services")
        .select("*")
        .eq("tutor_profile_id", (profile as TutorProfile).id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return {
    profile: (profile as TutorProfile) ?? null,
    services: (services as TutorService[]) ?? [],
  };
}
