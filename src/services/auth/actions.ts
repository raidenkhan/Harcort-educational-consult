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
// Brute-force throttle. In-memory is fine for a single Node instance; swap
// for a DB/Redis-backed limiter when the app runs on multiple instances.
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 5;
const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const failedAttempts = new Map<string, AttemptRecord>();

function pruneAttempts(now: number) {
  for (const [key, record] of failedAttempts) {
    if (now > record.resetAt) failedAttempts.delete(key);
  }
}

function isThrottled(key: string): boolean {
  const record = failedAttempts.get(key);
  if (!record) return false;
  if (Date.now() > record.resetAt) {
    failedAttempts.delete(key);
    return false;
  }
  return record.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(key: string) {
  const now = Date.now();
  const record = failedAttempts.get(key);
  if (!record || now > record.resetAt) {
    failedAttempts.set(key, { count: 1, resetAt: now + THROTTLE_WINDOW_MS });
  } else {
    record.count += 1;
  }
}

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
  pruneAttempts(Date.now());

  if (isThrottled(emailKey) || isThrottled(ipKey)) {
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
    recordFailure(emailKey);
    recordFailure(ipKey);
    return { error: "Invalid email or password." };
  }

  clearAttempts(emailKey);
  const token = await createSession(credential.profile_id);
  await setSessionCookie(token);

  redirect("/dashboard");
}

function clearAttempts(key: string) {
  failedAttempts.delete(key);
}

export async function signOutAction(): Promise<void> {
  await revokeSession();
  redirect("/");
}
