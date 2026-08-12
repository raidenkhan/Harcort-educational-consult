import type { Profile } from "@/types";

/**
 * Pure role-check helpers — dependency-free so client components and unit
 * tests can import them without pulling in next/headers or Supabase.
 */

/**
 * True when a profile carries admin privileges: the is_admin flag (0008,
 * tutors who are also admins) or the legacy role='admin' (pre-0008).
 */
export function profileIsAdmin(
  profile: Pick<Profile, "role" | "is_admin">,
): boolean {
  return profile.is_admin || profile.role === "admin";
}
