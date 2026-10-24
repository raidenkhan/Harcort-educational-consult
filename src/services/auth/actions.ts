"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { optionalText } from "@/lib/forms";
import {
  createSession,
  revokeSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { createThrottle } from "@/lib/auth/throttle";
import { safeNextPath } from "@/lib/auth/redirect";
import { isUnknownFunction } from "@/lib/auth/rpc";
import { requireProfile } from "./queries";
import {
  signInSchema,
  signUpSchema,
  switchRoleSchema,
  setStudyPrefsSchema,
  setSessionModeSchema,
  setPhoneSchema,
  setSmsOptOutSchema,
} from "./schemas";
import { DEFAULT_SESSION_MODE, type SessionMode } from "./sessionFormat";

/** Auth server actions — self-hosted auth.
 * No Supabase Auth calls, no confirmation emails, no provider rate-limit
 * ceiling: sign-up creates a profile + hashed credential atomically via the
 * register_user RPC, then issues an immediate session cookie. Sign-in is
 * throttled in-memory (per email + per IP) against credential stuffing.
 *
 * The session format (one-on-one vs group — 0021) is NOT part of sign-up:
 * it is chosen when the student books a tutor and saved to their profile
 * there, so registration stays short.
 */

export type AuthFormState = { error?: string; message?: string };

/**
 * Create the account through the `register_user` RPC (0003 → 0010 → 0021 →
 * 0022). Sign-up is the one funnel that must never break, so this tolerates a
 * database that hasn't caught up with the newest migration:
 *
 *   - 0022 applied → the 8-argument RPC writes profile + credential + the
 *     student's program, year and phone in ONE transaction.
 *   - 0022 not applied → the primary call fails with "function not found"
 *     (`isUnknownFunction`), so we retry against the live 5-argument 0021
 *     signature (which already stores the session format) and then set
 *     program/year — and phone, separately, since that column doesn't exist
 *     yet — in non-fatal follow-up writes. An unapplied migration must not
 *     lock everyone out of the product.
 *
 * Both paths are loud in the server log.
 */
async function registerUser(
  supabase: ReturnType<typeof createAdminClient>,
  params: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: "student" | "tutor";
    sessionMode: SessionMode;
    program?: string;
    year?: number | null;
    phone?: string | null;
  }
): Promise<{
  profileId: string | null;
  error: { code?: string | null; message: string } | null;
}> {
  const withExtras = await supabase.rpc("register_user", {
    p_email: params.email,
    p_password_hash: params.passwordHash,
    p_full_name: params.fullName,
    p_role: params.role,
    p_session_mode: params.sessionMode,
    p_program: params.program ?? null,
    p_year: params.year ?? null,
    p_phone: params.phone ?? null,
  });
  if (!withExtras.error || !isUnknownFunction(withExtras.error)) {
    return {
      profileId: (withExtras.data as string | null) ?? null,
      error: withExtras.error ?? null,
    };
  }

  console.error(
    "[auth] register_user(program, year, phone) is unavailable — apply " +
      "migration 0022. Falling back to the 0021 RPC.",
  );

  // Only the five arguments the live (0021) function actually accepts.
  const fallback = await supabase.rpc("register_user", {
    p_email: params.email,
    p_password_hash: params.passwordHash,
    p_full_name: params.fullName,
    p_role: params.role,
    p_session_mode: params.sessionMode,
  });
  if (fallback.error) {
    return { profileId: null, error: fallback.error };
  }

  const profileId = fallback.data as string;

  // The 0021 RPC already stored the session format; these two writes add the
  // 0019/0020 fields. Kept apart from the phone write so a missing `phone`
  // column can't roll back program/year with it.
  if (params.program || params.year != null) {
    const { error } = await supabase
      .from("profiles")
      .update({ program: params.program ?? null, year: params.year ?? null })
      .eq("id", profileId);
    if (error) {
      console.error(`[auth] program/year not saved: ${error.message}`);
    }
  }
  if (params.phone) {
    const { error } = await supabase
      .from("profiles")
      .update({ phone: params.phone })
      .eq("id", profileId);
    if (error) {
      console.error(`[auth] phone not saved (apply 0022): ${error.message}`);
    }
  }

  return { profileId, error: null };
}

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
  const yearText = optionalText(formData.get("year"));
  const parsed = signUpSchema.safeParse({
    email: optionalText(formData.get("email")),
    password: formData.get("password"),
    fullName: optionalText(formData.get("fullName")),
    role: optionalText(formData.get("role")),
    // `optionalText` collapses both an unrendered control (null) and a blank
    // input ("") to undefined for the fields a role may not send.
    sessionMode: optionalText(formData.get("sessionMode")),
    program: optionalText(formData.get("program")),
    year: yearText ? Number(yearText) : undefined,
    phone: optionalText(formData.get("phone")),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const supabase = createAdminClient();

  const { profileId, error } = await registerUser(supabase, {
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    fullName: parsed.data.fullName,
    role: parsed.data.role,
    sessionMode: parsed.data.sessionMode ?? DEFAULT_SESSION_MODE,
    program: parsed.data.role === "student" ? parsed.data.program : undefined,
    year: parsed.data.role === "student" ? parsed.data.year : undefined,
    phone: parsed.data.phone,
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

  revalidateTag("tutors", "max");
  revalidatePath("/");

  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
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

  redirect(safeNextPath(formData.get("next")) ?? "/dashboard");
}

export async function signOutAction(): Promise<void> {
  await revokeSession();
  redirect("/");
}

/** A student declares their study prefs (0019 program + 0020 year) from the
 * dashboard picker. Drives the per-program personalization: the dashboard
 * lists that program's courses for their year (each course page carries its
 * materials + tutors). Program is free text with a length cap; year is 1–4.
 * A non-matching program just yields an empty course list, so there's no
 * trust-boundary risk to guard.
 */
export async function setStudyPrefsAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const yearRaw = String(formData.get("year") ?? "").trim();
  const parsed = setStudyPrefsSchema.safeParse({
    program: formData.get("program"),
    year: yearRaw ? Number(yearRaw) : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a program." };
  }

  const profile = await requireProfile();
  if (profile.role !== "student") {
    return { error: "Only students pick a program." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      program: parsed.data.program,
      year: parsed.data.year ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return {
    message: parsed.data.year
      ? `Set to ${parsed.data.program} · Year ${parsed.data.year}.`
      : `Program set to ${parsed.data.program}.`,
  };
}

/** A student changes how they want their sessions (0021) from the dashboard.
 * One-on-one or group — stored on the profile, so the tutor sees it on every
 * request they receive. Students only: for a tutor the value is meaningless.
 */
export async function setSessionModeAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = setSessionModeSchema.safeParse({
    sessionMode: formData.get("sessionMode") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a session format." };
  }

  const profile = await requireProfile();
  if (profile.role !== "student") {
    return { error: "Only students pick a session format." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      session_mode: parsed.data.sessionMode,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return {
    message:
      parsed.data.sessionMode === "group"
        ? "Set to group sessions — tutors will see this on your requests."
        : "Set to one-on-one sessions — tutors will see this on your requests.",
  };
}

/** A signed-in user sets—or clears—the phone number we text them on (0022).
 * Optional for every role: nothing else depends on it, and removing a number
 * is a first-class action rather than an error. Students are the audience for
 * the session texts; a tutor number is stored all the same.
 */
export async function setPhoneAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = setPhoneSchema.safeParse({
    phone: optionalText(formData.get("phone")),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the phone number.",
    };
  }

  const profile = await requireProfile();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      phone: parsed.data.phone ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard");
  return {
    message: parsed.data.phone
      ? `We'll text session updates to ${parsed.data.phone}.`
      : "Phone number removed.",
  };
}

/**
 * SMS opt-out (0027). The user's kill switch: while it is on, the app never
 * texts this number — reminders, request updates, payment notices and reset
 * codes all skip it.
 */
export async function setSmsOptOutAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = setSmsOptOutSchema.safeParse({
    optedOut: formData.get("optedOut"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not save that." };
  }

  const profile = await requireProfile();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      sms_opt_out: parsed.data.optedOut,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  revalidatePath("/tutor", "layout");
  return {
    message: parsed.data.optedOut
      ? "Text messages are off. We won't text this number any more."
      : "Text messages are on.",
  };
}

/** Self-service role switch (student ↔ tutor) — e.g. a Google sign-up who
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
  revalidatePath("/tutor", "layout");
  revalidatePath("/admin", "layout");

  return {
    message:
      parsed.data.role === "tutor"
        ? "You're now a tutor. Set up your tutor profile to get reviewed."
        : "You're now a student. Your tutor profile is hidden until you switch back.",
  };
}

/** One-time onboarding for brand-new Google accounts (0010). Picks the role
 * only — the session format (0021) is chosen at booking time, when a student
 * requests a tutor — and stamps onboarding_completed_at so the /onboarding
 * screen never shows again. Same role validation as switchRoleAction —
 * admin is impossible.
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
  revalidatePath("/tutor", "layout");
  revalidatePath("/onboarding");

  redirect("/dashboard");
}
