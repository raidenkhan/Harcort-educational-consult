import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import type { Profile, UserRole } from "@/types";

/**
 * Auth queries — the authoritative session/role guards used by pages.
 * Even though middleware redirects, every protected page re-checks here
 * (defense in depth: middleware alone is never sufficient).
 */

export async function getCurrentProfile(): Promise<Profile | null> {
  return getSessionProfile();
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getSessionProfile();
  if (profile) return profile;

  // Auth is a modal on the landing page — send visitors there with the
  // ?auth=sign-in param so the modal opens automatically. (Matches what the
  // middleware does; this also covers environments where middleware doesn't
  // run, e.g. dev-mode Turbopack.)
  redirect("/?auth=sign-in");
}

/**
 * True when a profile carries admin privileges: the is_admin flag (0008,
 * tutors who are also admins) or the legacy role='admin' (pre-0008). Pure,
 * so client components can use it on serialized profiles.
 */
export function profileIsAdmin(profile: Pick<Profile, "role" | "is_admin">): boolean {
  return profile.is_admin || profile.role === "admin";
}

export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  const ok = roles.some((r) =>
    r === "admin" ? profileIsAdmin(profile) : profile.role === r,
  );
  if (!ok) redirect("/dashboard");
  return profile;
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getSessionProfile();
  return profile ? profileIsAdmin(profile) : false;
}
