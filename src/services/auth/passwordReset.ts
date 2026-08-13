"use server";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createThrottle } from "@/lib/auth/throttle";
import { notifyPasswordReset } from "@/lib/email/notify";
import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/services/auth/queries";
import { resetRedeemSchema, resetRequestSchema } from "./schemas";

/**
 * Password reset — self-service by email, with an admin out-of-band fallback.
 *
 * Primary path: a student who forgot their password enters their email on
 * /forgot-password → `requestResetCode` generates a one-time code, emails it
 * straight to them, and they redeem it (no session required). The response is
 * deliberately generic ("if an account exists, a code was sent") so the public
 * endpoint can't be used to probe which emails have accounts.
 *
 * Fallback: an admin can still issue a code from /admin (`generateResetCode`)
 * and share it out-of-band (WhatsApp / phone) for users who signed up with a
 * fake or no email. Both paths write to the same `password_resets` table.
 *
 * Codes are stored SHA-256-hashed, single-use with a 30-minute expiry; issuing
 * a new code voids outstanding ones for that user. Redeeming revokes every
 * existing session, and redemption is throttled per-email against brute force.
 * Requesting is throttled per-email + per-IP (same throttle as sign-in) to
 * stop inbox flooding and enumeration.
 */

export type ResetFormState = { error?: string; message?: string; code?: string };

const RESET_TTL_MS = 30 * 60 * 1000;
const CODE_DIGITS = 8;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function codesEqual(a: string, b: string): boolean {
  const ha = Buffer.from(a, "hex");
  const hb = Buffer.from(b, "hex");
  return ha.length === hb.length && timingSafeEqual(ha, hb);
}

// ---------------------------------------------------------------------------
// Brute-force throttle for code redemption (in-memory; fine for one instance).
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 5;
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
  return record.count >= MAX_ATTEMPTS;
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

function clearAttempts(key: string) {
  failedAttempts.delete(key);
}

// Request throttle — shared primitive (same as sign-in), keyed per email + IP.
const requestThrottle = createThrottle();

async function getClientIp(): Promise<string> {
  const headersList = await headers();
  return headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Create a reset code for an existing profile. Voids any outstanding codes
 * first (only the newest should ever work), then inserts a fresh one.
 * Returns the plaintext code so the caller decides how to share it.
 */
async function createResetCode(
  profileId: string,
  createdBy: string | null,
): Promise<{ code: string } | { error: string }> {
  const supabase = createAdminClient();

  await supabase
    .from("password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .is("used_at", null);

  const code = String(randomInt(10 ** (CODE_DIGITS - 1), 10 ** CODE_DIGITS));
  const { error } = await supabase.from("password_resets").insert({
    profile_id: profileId,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    created_by: createdBy,
  });
  if (error) return { error: error.message };
  return { code };
}

/**
 * Self-service: a locked-out user enters their email and the code is emailed
 * automatically — no admin involved. Throttled per email + per IP. The reply
 * is identical whether or not the account exists (no email enumeration), so a
 * wrong email just quietly sends nothing.
 */
export async function requestResetCode(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter your email." };
  }
  const email = parsed.data.email.trim().toLowerCase();

  const emailKey = `request:${email}`;
  const ipKey = `request-ip:${await getClientIp()}`;
  requestThrottle.prune();

  // Every request burns a slot (success or not) — prevents both inbox
  // flooding and timing-based account probing.
  if (requestThrottle.isThrottled(emailKey) || requestThrottle.isThrottled(ipKey)) {
    return { error: "Too many requests. Please wait a few minutes and try again." };
  }
  requestThrottle.recordFailure(emailKey);
  requestThrottle.recordFailure(ipKey);

  const supabase = createAdminClient();
  const { data: credential } = await supabase
    .from("credentials")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();

  // Unknown email — same generic reply, no code generated, nothing emailed.
  if (!credential) {
    return {
      message:
        "If an account exists for that email, a reset code has been sent to it.",
    };
  }

  const issued = await createResetCode(
    (credential as { profile_id: string }).profile_id,
    null, // self-service — no admin involved
  );
  if ("error" in issued) return { error: issued.error };

  notifyPasswordReset({ email, code: issued.code });

  return {
    message:
      "If an account exists for that email, a reset code has been sent to it.",
  };
}

/** Admin generates a one-time reset code for a user's email (fallback). */
export async function generateResetCode(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const admin = await requireRole("admin");

  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter the user's email." };
  }
  const email = parsed.data.email.trim().toLowerCase();

  const supabase = createAdminClient();

  const { data: credential } = await supabase
    .from("credentials")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();

  if (!credential) return { error: "No account found for that email." };

  const issued = await createResetCode(
    (credential as { profile_id: string }).profile_id,
    admin.id,
  );
  if ("error" in issued) return { error: issued.error };

  // Email the code straight to the student (best-effort, after the response).
  // The admin still sees it as a fallback if email ever fails.
  notifyPasswordReset({ email, code: issued.code });

  return {
    message: `Code generated for ${email} and emailed to them — it expires in 30 minutes.`,
    code: issued.code,
  };
}

/** Public redemption: email + one-time code + new password (no session). */
export async function redeemResetCode(
  _prev: ResetFormState,
  formData: FormData,
): Promise<ResetFormState> {
  const parsed = resetRedeemSchema.safeParse({
    email: formData.get("email"),
    code: formData.get("code"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailKey = `reset:${email}`;
  pruneAttempts(Date.now());
  if (isThrottled(emailKey)) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  const supabase = createAdminClient();

  const { data: credential } = await supabase
    .from("credentials")
    .select("profile_id")
    .eq("email", email)
    .maybeSingle();
  if (!credential) {
    recordFailure(emailKey);
    return { error: "Invalid or expired code." };
  }

  const { data: reset } = await supabase
    .from("password_resets")
    .select("*")
    .eq("profile_id", (credential as { profile_id: string }).profile_id)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    !reset ||
    !codesEqual(hashCode(parsed.data.code), (reset as { code_hash: string }).code_hash)
  ) {
    recordFailure(emailKey);
    return { error: "Invalid or expired code." };
  }

  // Single-use: claim the code atomically before touching anything else, so
  // two simultaneous redeems can't both succeed (second gets rowCount 0).
  const { data: claimed, error: claimError } = await supabase
    .from("password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("id", (reset as { id: number }).id)
    .is("used_at", null)
    .select("id");
  if (claimError) return { error: claimError.message };
  if (!claimed || claimed.length === 0) {
    recordFailure(emailKey);
    return { error: "This code was already used." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const { error: updateError } = await supabase
    .from("credentials")
    .update({ password_hash: passwordHash })
    .eq("profile_id", (credential as { profile_id: string }).profile_id);
  if (updateError) return { error: updateError.message };

  // Safety: revoke every existing session so stolen cookies die with the reset.
  await supabase
    .from("sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("profile_id", (credential as { profile_id: string }).profile_id)
    .is("revoked_at", null);

  clearAttempts(emailKey);
  return { message: "Password reset. Sign in with your new password." };
}
