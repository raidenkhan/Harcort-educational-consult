import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/constants";
import type { Profile } from "@/types";

/**
 * Session management — self-hosted auth sessions.
 *
 * The browser holds an opaque random token in an httpOnly cookie; only its
 * SHA-256 hash is stored in `sessions`. Every lookup hashes the cookie value
 * first, so a leaked `sessions` table is useless to an attacker.
 */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a session row and return the raw token to hand to the browser. */
export async function createSession(profileId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");

  const supabase = createAdminClient();
  const { error } = await supabase.from("sessions").insert({
    token_hash: hashToken(token),
    profile_id: profileId,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) throw new Error(error.message);

  return token;
}

/** Write the session cookie (server actions only — middleware does not call this). */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** Resolve the session cookie to the signed-in profile, or null. */
export async function getSessionProfile(): Promise<Profile | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sessions")
    .select("profiles(*)")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return (data?.profiles as Profile | undefined) ?? null;
}

/** Revoke the current session and clear the cookie (sign-out). */
export async function revokeSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const supabase = createAdminClient();
    await supabase
      .from("sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashToken(token));
  }

  cookieStore.delete(SESSION_COOKIE);
}
