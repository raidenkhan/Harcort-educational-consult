"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  revokeSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { createThrottle } from "@/lib/auth/throttle";
import { requireProfile } from "./queries";
import { signInSchema, signUpSchema, switchRoleSchema } from "./schemas";

/**
 * Auth server actions — self-hosted auth.
 *
 * No Supabase Auth calls, no confirmation emails, no provider rate-limit
 * ceiling: sign-up creates a profile + hashed credential atomically via the
 * register_user RPC, then issues an immediate session cookie. Sign-in is
 * throttled in-memory (per email + per IP) against credential stuffing.
 */

export type AuthFormState = { error?: string; message?: string };

// A well-formed scrypt hash used only to burn equal CPU when the email
// isn't found (keeps "wrong password" and "no such user" indistinguishable).
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

// ---------------------------------------------------------------------------
// Brute-force throttle (see src/lib/auth/throttle.ts).
// ---------------------------------------------------------------------------
const throttle = createThrottle();

async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const supabase = createAdminClient();

  const { data: profileId, error } = await supabase.rpc("register_user", {
    p_email: parsed.data.email,
    p_password_hash: await hashPassword(parsed.data.password),
    p_full_name: parsed.data.fullName,
    p_role: parsed.data.role,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "An account with this email already exists." };
    }
    return { error: error.message };
  }

  // Instant session — no email confirmation involved.
  const token = await createSession(profileId as string);
  await setSessionCookie(token);

  redirect("/dashboard");
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const emailKey = `email:${parsed.data.email.trim().toLowerCase()}`;
  const ipKey = `ip:${await getClientIp()}`;
  throttle.prune();

  if (throttle.isThrottled(emailKey) || throttle.isThrottled(ipKey)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const supabase = createAdminClient();

  const { data: credential } = await supabase
    .from("credentials")
    .select("profile_id, password_hash")
    .eq("email", parsed.data.email.trim().toLowerCase())
    .maybeSingle();

  const passwordOk = await verifyPassword(
    parsed.data.password,
    credential?.password_hash ?? DUMMY_HASH,
  );

  if (!credential || !passwordOk) {
    throttle.recordFailure(emailKey);
    throttle.recordFailure(ipKey);
    return { error: "Invalid email or password." };
  }

  throttle.clear(emailKey);
  const token = await createSession(credential.profile_id);
  await setSessionCookie(token);

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await revokeSession();
  redirect("/");
}

/**
 * Self-service role switch (student ↔ tutor) — e.g. a Google sign-up who
 * defaulted to student, or a tutor taking a break. Admin is never switchable:
 * the schema only allows 'student'/'tutor' and requireProfile guards the
 * acting session.
 *
 * Switching to student hides the user's tutor listing (the public directory
 * filters profiles.role); the tutor_profile row is kept, so switching back
 * re-lists them. Switching to tutor surfaces the tutor onboarding prompt.
 */
export async function switchRoleAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = switchRoleSchema.safeParse({ role: formData.get("role") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid role." };
  }

  const profile = await requireProfile();
  if (profile.role !== "student" && profile.role !== "tutor") {
    return { error: "This role can't be switched." };
  }
  if (profile.role === parsed.data.role) {
    return { error: `You're already a ${parsed.data.role}.` };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      role: parsed.data.role,
      updated_at: new Date().toISOString(),
      // A conscious role choice counts as finishing onboarding — covers a
      // brand-new Google user who skipped /onboarding and switched here.
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    return { error: error.message };
  }

  // The public tutor directory is cached — refresh it plus the role-driven
  // pages so nav, cards, and the tutor onboarding prompt all update.
  revalidateTag("tutors", "max");
  revalidatePath("/dashboard");
  revalidatePath("/");
  revalidatePath("/tutor");
  revalidatePath("/admin");

  return {
    message:
      parsed.data.role === "tutor"
        ? "You're now a tutor. Set up your tutor profile to get reviewed."
        : "You're now a student. Your tutor profile is hidden until you switch back.",
  };
}

/**
 * One-time onboarding for brand-new Google accounts (0010). Picks the role
 * AND stamps onboarding_completed_at so the /onboarding screen never shows
 * again. Same validation as switchRoleAction — admin is impossible.
 */
export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const parsed = switchRoleSchema.safeParse({ role: formData.get("role") });
  if (!parsed.success) {
    redirect("/onboarding"); // malformed — stay on the picker
  }

  const profile = await requireProfile();
  if (profile.onboarding_completed_at) {
    redirect("/dashboard"); // already done
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      role: parsed.data.role,
      onboarding_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    redirect("/onboarding");
  }

  revalidateTag("tutors", "max");
  revalidatePath("/dashboard");
  revalidatePath("/");
  revalidatePath("/tutor");
  revalidatePath("/onboarding");

  redirect("/dashboard");
}
