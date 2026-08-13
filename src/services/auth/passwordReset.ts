"use server";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyPasswordReset } from "@/lib/email/notify";
import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/services/auth/queries";
import { resetRedeemSchema, resetRequestSchema } from "./schemas";

/**
 * Password reset — admin-issued one-time codes.
 *
 * Email recovery isn't available (Supabase auth email rate limits), so an
 * admin generates a code and shares it out-of-band (WhatsApp / phone). The
 * user redeems it — no session required, since a locked-out user has none —
 * with a new password. Redeeming revokes every existing session for that
 * user, and redemption is throttled per-email against brute force.
 *
 * Codes are stored SHA-256-hashed (same discipline as `sessions`) and are
 * single-use with a 30-minute expiry; issuing a new code voids outstanding
 * ones for that user.
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

/** Admin generates a one-time reset code for a user's email. */
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

  // Only the newest code should ever work — void any outstanding ones.
  await supabase
    .from("password_resets")
    .update({ used_at: new Date().toISOString() })
    .eq("profile_id", (credential as { profile_id: string }).profile_id)
    .is("used_at", null);

  const code = String(randomInt(10 ** (CODE_DIGITS - 1), 10 ** CODE_DIGITS));
  const { error } = await supabase.from("password_resets").insert({
    profile_id: (credential as { profile_id: string }).profile_id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    created_by: admin.id,
  });
  if (error) return { error: error.message };

  // Email the code straight to the student (best-effort, after the response).
  // The admin still sees it as a fallback if email ever fails.
  notifyPasswordReset({ email, code });

  return {
    message: `Code generated for ${email} and emailed to them — it expires in 30 minutes.`,
    code,
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
