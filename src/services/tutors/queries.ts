import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/services/auth/queries";
import {
  toTutorListings,
  type TutorListing,
  type TutorProfileRow,
} from "@/services/tutors/listing";
import type { TutorProfile, TutorService } from "@/types";

/**
 * Tutor queries.
 * All reads run through the server-only service-role client and scope
 * explicitly (public read = only approved tutors; private read = own rows).
 */

// TutorListing moved to the pure module (listing.ts) so its mapper can be
// unit-tested without Supabase. Re-exported for existing consumers
// (components/tutors/TutorExplorer.tsx).
export type { TutorListing };

/**
 * Approved tutors for the public landing page.
 *
 * Cached after the first real request (5 min TTL) — the page reads from cache
 * instead of hitting Supabase on every visit. Admin approve/reject calls
 * revalidateTag("tutors") so changes show up immediately.
 *
 * Hidden: profiles whose role is 'student' (a tutor who self-switched to
 * student keeps their approved tutor_profile row but stops being listed;
 * switching back re-lists them). role='tutor' and legacy role='admin' (an
 * admin who also tutors) both pass the filter.
 *
 * The `!inner` join makes PostgREST DROP rows whose profiles embed fails the
 * role filter. This matters: a plain `profiles(*)` embed keeps such rows but
 * returns their embed as null, and the old mapper then produced
 * `profile: null` entries that crashed rendering with
 * "Cannot read properties of null (reading 'full_name')" — a production 500
 * on `/` and `/tutors` (see 2026-09-28 incident). `toTutorListings` also
 * skips any such row as defense in depth.
 */
export const listApprovedTutors = unstable_cache(
  async (): Promise<TutorListing[]> => {
    const supabase = createAdminClient();

    // error MUST be checked: on a transient failure (cold start, network
    // blip, stale service key) `data` is null and returning [] here would
    // let unstable_cache cache the empty array — production then shows
    // "0 approved tutors" for up to 5 minutes while the DB has tutors.
    // Throwing keeps the failure out of the cache so the next request
    // refetches (and surfaces the problem instead of publishing a lie).
    const { data, error } = await supabase
      .from("tutor_profiles")
      .select("*, profiles!inner(*), tutor_services(*, courses(*))")
      .eq("verification_status", "approved")
      .neq("profiles.role", "student")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`listApprovedTutors: ${error.message}`);
    }

    return toTutorListings((data ?? []) as TutorProfileRow[]);
  },
  ["approved-tutors"],
  { revalidate: 300, tags: ["tutors"] },
);

/**
 * Non-throwing variant for public pages: a transient DB failure degrades
 * ONE request (logged, empty list) instead of 500ing the marketing page —
 * and because the cached fn throws on error, the empty result is never
 * cached, so the very next request refetches.
 */
export async function safeListApprovedTutors(): Promise<TutorListing[]> {
  try {
    return await listApprovedTutors();
  } catch (error) {
    console.error("[tutors] listApprovedTutors failed:", error);
    return [];
  }
}

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
