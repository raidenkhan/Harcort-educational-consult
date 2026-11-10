"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword } from "@/lib/auth/password";
import { isUnknownFunction } from "@/lib/auth/rpc";
import { formText } from "@/lib/forms";
import { requireRole } from "@/services/auth/queries";
import { adminTargetSchema, createCourseSchema, createTutorSchema } from "./schemas";

/**
 * Admin console — create and delete tutors and courses.
 *
 * Deletion never destroys money records. `engagements.tutor_profile_id`
 * CASCADES (0011), so deleting a tutor who has bookings would silently wipe
 * those agreements and their payments — the delete is refused instead, and
 * the admin can remove them from the directory (reject → hidden, history
 * kept). `engagements.course_id` is ON DELETE RESTRICT, and the course delete
 * checks first so the admin gets a sentence rather than a Postgres error.
 */

export type ManageState = { error?: string; message?: string };

async function audit(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  const { error } = await createAdminClient().from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    metadata,
  });
  if (error) console.error(`[admin] audit write failed: ${error.message}`);
}

function revalidateTutors() {
  revalidateTag("tutors", "max");
  revalidatePath("/admin", "layout");
  revalidatePath("/tutors");
  revalidatePath("/");
}

function revalidateCourses() {
  revalidateTag("courses", "max");
  revalidateTag("tutors", "max");
  revalidatePath("/admin", "layout");
  revalidatePath("/courses");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Tutors
// ---------------------------------------------------------------------------

/**
 * Add a tutor: creates their account (role tutor, the password the admin
 * set) and an APPROVED tutor profile, so they can sign in and add their bio
 * and courses from Settings straight away. Approval goes through the same
 * admin_approve_tutor RPC as the review queue (verified actor + audit row).
 */
export async function createTutorAccount(
  _prev: ManageState,
  formData: FormData,
): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = createTutorSchema.safeParse({
    fullName: formText(formData.get("fullName")),
    email: formText(formData.get("email")).toLowerCase(),
    password: formText(formData.get("password")),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const { fullName, email, password, phone } = parsed.data;

  const supabase = createAdminClient();
  const passwordHash = await hashPassword(password);

  let reg = await supabase.rpc("register_user", {
    p_email: email,
    p_password_hash: passwordHash,
    p_full_name: fullName,
    p_role: "tutor",
    p_session_mode: "one_on_one",
    p_program: null,
    p_year: null,
    p_phone: phone ?? null,
  });
  if (reg.error && isUnknownFunction(reg.error)) {
    reg = await supabase.rpc("register_user", {
      p_email: email,
      p_password_hash: passwordHash,
      p_full_name: fullName,
      p_role: "tutor",
      p_session_mode: "one_on_one",
    });
  }
  if (reg.error) {
    return {
      error:
        reg.error.code === "23505"
          ? "An account with this email already exists."
          : `Couldn't create the account: ${reg.error.message}`,
    };
  }
  const profileId = reg.data as string | null;
  if (!profileId) return { error: "Couldn't create the account. Please try again." };

  const { data: tutorProfile, error: tpError } = await supabase
    .from("tutor_profiles")
    .insert({ profile_id: profileId })
    .select("id")
    .single();
  if (tpError || !tutorProfile) {
    return {
      error: `The account was created, but its tutor profile wasn't: ${tpError?.message ?? "unknown error"}. Approve it from Tutor applications once it appears.`,
    };
  }

  const { error: approveError } = await supabase.rpc("admin_approve_tutor", {
    actor_id: admin.id,
    target_id: (tutorProfile as { id: string }).id,
    note: "Added by an admin",
  });
  if (approveError) {
    return {
      error: `Account created, but approval failed (${approveError.message}). Approve ${fullName} from Tutor applications.`,
    };
  }

  revalidateTutors();
  return {
    message: `${fullName} is set up as an approved tutor. They sign in with ${email} and the password you set, then add their bio and courses from Settings.`,
  };
}

/** Bookings this tutor is part of (any status) — the delete guard. */
async function tutorBookingCount(tutorProfileId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("engagements")
    .select("id", { count: "exact", head: true })
    .eq("tutor_profile_id", tutorProfileId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Delete a tutor's account entirely (profile, tutor profile, course offers,
 * chats, requests). Refused when they have ANY booking — see the module note.
 */
export async function deleteTutorAccount(profileId: string): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = adminTargetSchema.safeParse({ id: profileId });
  if (!parsed.success) return { error: "Unknown tutor." };

  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_admin, tutor_profiles(id)")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!target) return { error: "That tutor no longer exists." };
  const row = target as {
    id: string;
    full_name: string | null;
    role: string;
    is_admin: boolean | null;
    tutor_profiles?: { id: string } | { id: string }[] | null;
  };
  if (row.role !== "tutor" || row.is_admin) {
    return { error: "Only tutor accounts can be deleted here." };
  }
  const tp = Array.isArray(row.tutor_profiles) ? row.tutor_profiles[0] : row.tutor_profiles;
  if (tp && (await tutorBookingCount(tp.id)) > 0) {
    return {
      error: `${row.full_name ?? "This tutor"} has bookings, so deleting them would erase students' payment records. Remove them from the directory instead.`,
    };
  }

  const { error } = await supabase.from("profiles").delete().eq("id", row.id);
  if (error) return { error: `Couldn't delete: ${error.message}` };

  await audit(admin.id, "tutor_deleted", "profile", row.id, { name: row.full_name });
  revalidateTutors();
  return { message: `${row.full_name ?? "The tutor"} was deleted.` };
}

/**
 * Remove a tutor from the directory without deleting anything: their
 * profile is set to rejected (so they can't be found or booked), and every
 * booking, payment and payout stays intact. Reversible by approving again.
 */
export async function hideTutor(profileId: string): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = adminTargetSchema.safeParse({ id: profileId });
  if (!parsed.success) return { error: "Unknown tutor." };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tutor_profiles")
    .select("id, profiles(full_name)")
    .eq("profile_id", parsed.data.id)
    .maybeSingle();
  if (!data) return { error: "That tutor has no tutor profile." };
  const tp = data as { id: string; profiles?: { full_name: string | null } | { full_name: string | null }[] | null };
  const name = (Array.isArray(tp.profiles) ? tp.profiles[0] : tp.profiles)?.full_name ?? "The tutor";

  const { error } = await supabase.rpc("admin_reject_tutor", {
    actor_id: admin.id,
    target_id: tp.id,
    note: "Removed from the directory by an admin",
  });
  if (error) return { error: `Couldn't remove: ${error.message}` };

  revalidateTutors();
  return { message: `${name} was removed from the directory. Their bookings and payments are kept.` };
}

/** Put a hidden (rejected) tutor back in the directory. */
export async function restoreTutor(profileId: string): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = adminTargetSchema.safeParse({ id: profileId });
  if (!parsed.success) return { error: "Unknown tutor." };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", parsed.data.id)
    .maybeSingle();
  if (!data) return { error: "That tutor has no tutor profile." };

  const { error } = await supabase.rpc("admin_approve_tutor", {
    actor_id: admin.id,
    target_id: (data as { id: string }).id,
    note: "Restored to the directory by an admin",
  });
  if (error) return { error: `Couldn't restore: ${error.message}` };

  revalidateTutors();
  return { message: "The tutor is back in the directory." };
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

/** Add a course to a programme's catalogue — published immediately. */
export async function createCourse(
  _prev: ManageState,
  formData: FormData,
): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = createCourseSchema.safeParse({
    subject: formText(formData.get("subject")),
    code: formText(formData.get("code")),
    name: formText(formData.get("name")),
    credits: formData.get("credits"),
    year: formData.get("year"),
    semester: formData.get("semester"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  const c = parsed.data;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("courses")
    .insert({
      subject: c.subject,
      code: c.code,
      name: c.name,
      credits: c.credits ?? null,
      year: c.year ?? null,
      semester: c.semester ?? null,
      description: c.description ?? null,
      is_approved: true,
      created_by_profile_id: admin.id,
    })
    .select("id")
    .single();
  if (error) {
    return {
      error:
        error.code === "23505"
          ? `${c.code} already exists in ${c.subject}.`
          : `Couldn't add the course: ${error.message}`,
    };
  }

  await audit(admin.id, "course_created", "course", (data as { id: string }).id, {
    code: c.code,
    subject: c.subject,
  });
  revalidateCourses();
  return { message: `${c.code} ${c.name} was added to ${c.subject}.` };
}

/**
 * Delete a course from the catalogue. Refused while any booking uses it
 * (the database would refuse too — ON DELETE RESTRICT); tutors' offers for
 * it and its materials/videos are removed with it (they cascade).
 */
export async function deleteCourse(courseId: string): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = adminTargetSchema.safeParse({ id: courseId });
  if (!parsed.success) return { error: "Unknown course." };

  const supabase = createAdminClient();
  const { data: course } = await supabase
    .from("courses")
    .select("id, code, name")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!course) return { error: "That course no longer exists." };
  const label = [course.code, course.name].filter(Boolean).join(" ");

  const { count: bookings, error: countError } = await supabase
    .from("engagements")
    .select("id", { count: "exact", head: true })
    .eq("course_id", parsed.data.id);
  if (countError) return { error: countError.message };
  if ((bookings ?? 0) > 0) {
    return {
      error: `${label} has ${bookings} booking${bookings === 1 ? "" : "s"}, so it can't be deleted — that would break students' payment records.`,
    };
  }

  const { error } = await supabase.from("courses").delete().eq("id", parsed.data.id);
  if (error) return { error: `Couldn't delete: ${error.message}` };

  await audit(admin.id, "course_deleted", "course", parsed.data.id, { label });
  revalidateCourses();
  return { message: `${label} was deleted.` };
}

// ---------------------------------------------------------------------------
// Blocking (0043)
// ---------------------------------------------------------------------------

/**
 * Block a student or tutor: they can't sign in (email or Google), every
 * session they had is revoked now, and a blocked tutor leaves the directory.
 * Nothing is deleted — bookings, payments and chats stay. Admin accounts and
 * the acting admin can't be blocked.
 */
export async function blockAccount(profileId: string): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = adminTargetSchema.safeParse({ id: profileId });
  if (!parsed.success) return { error: "Unknown account." };
  if (parsed.data.id === admin.id) return { error: "You can't block your own account." };

  const supabase = createAdminClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_admin")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!target) return { error: "That account no longer exists." };
  if (target.role === "admin" || target.is_admin) {
    return { error: "Admin accounts can't be blocked." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      blocked_at: new Date().toISOString(),
      blocked_by: admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id);
  if (error) {
    return {
      error: /blocked_at|column/i.test(error.message)
        ? "Blocking isn't set up yet — apply migration 0043 in Supabase, then try again."
        : `Couldn't block: ${error.message}`,
    };
  }

  // Sign them out everywhere, now.
  await supabase
    .from("sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("profile_id", target.id)
    .is("revoked_at", null);

  await audit(admin.id, "account_blocked", "profile", target.id, { name: target.full_name });
  revalidateTutors();
  return { message: `${target.full_name ?? "The account"} is blocked and has been signed out.` };
}

/** Lift a block: the person can sign in again (they start a fresh session). */
export async function unblockAccount(profileId: string): Promise<ManageState> {
  const admin = await requireRole("admin");
  const parsed = adminTargetSchema.safeParse({ id: profileId });
  if (!parsed.success) return { error: "Unknown account." };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({
      blocked_at: null,
      blocked_by: null,
      blocked_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .select("full_name")
    .maybeSingle();
  if (error) {
    return {
      error: /blocked_at|column/i.test(error.message)
        ? "Blocking isn't set up yet — apply migration 0043 in Supabase, then try again."
        : `Couldn't unblock: ${error.message}`,
    };
  }

  await audit(admin.id, "account_unblocked", "profile", parsed.data.id, {});
  revalidateTutors();
  return { message: `${data?.full_name ?? "The account"} is unblocked and can sign in again.` };
}
