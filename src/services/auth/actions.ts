"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  createSession,
  revokeSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { createThrottle } from "@/lib/auth/throttle";
import { signInSchema, signUpSchema } from "./schemas";

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
