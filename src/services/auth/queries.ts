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

export async function requireRole(...roles: UserRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!roles.includes(profile.role)) redirect("/dashboard");
  return profile;
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getSessionProfile();
  return profile?.role === "admin";
}
