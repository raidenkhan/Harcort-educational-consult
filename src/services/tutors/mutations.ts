"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTutorApplication } from "@/lib/email/notify";
import { isMissingColumn } from "@/lib/postgres";
import { normalizeCourseCode } from "@/services/courses/codes";
import { requireProfile } from "@/services/auth/queries";
import { tutorProfileSchema, tutorServiceSchema } from "./schemas";

/**
 * Tutor mutations — onboarding flows.
 * New tutor profiles are created with status = 'pending'; RLS ensures they are
 * invisible to the public until an admin approves them.
 */

export type TutorFormState = { error?: string; message?: string };

export async function submitTutorProfile(
  _prev: TutorFormState,
  formData: FormData,
): Promise<TutorFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor") return { error: "Only tutor accounts can do this." };

  const parsed = tutorProfileSchema.safeParse({
    bio: formData.get("bio"),
    qualifications: formData.get("qualifications"),
    ratePerSemester: formData.get("ratePerSemester"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const supabase = createAdminClient();

  // Fetch the existing tutor profile to decide insert vs update.
  const { data: existing } = await supabase
    .from("tutor_profiles")
    .select("id, verification_status")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const base = {
    bio: parsed.data.bio,
    qualifications: parsed.data.qualifications,
  };

  /**
   * Write the advertised rate to whichever column this database has.
   *
   * 0028 renamed `rate_per_hour` → `rate_per_semester`. The app is deployed
   * separately from the migration, so the write tries the new column and, if
   * Postgres says it doesn't exist yet, retries against the old one — the
   * profile saves either way.
   */
  const write = async (column: "rate_per_semester" | "rate_per_hour") =>
    existing
      ? await supabase
          .from("tutor_profiles")
          .update({ ...base, [column]: parsed.data.ratePerSemester })
          .eq("id", (existing as { id: string }).id)
      : await supabase.from("tutor_profiles").insert({
          ...base,
          [column]: parsed.data.ratePerSemester,
          profile_id: profile.id,
        });

  let { error } = await write("rate_per_semester");
  if (error && isMissingColumn(error)) {
    console.warn(
      "[tutors] rate_per_semester missing — falling back to rate_per_hour (apply migration 0028).",
    );
    ({ error } = await write("rate_per_hour"));
  }

  if (error) return { error: error.message };

  // Ping the admin team when a profile needs review — a brand-new one, or a
  // rejected one being resubmitted. Edits to an already-approved profile are
  // silent (best-effort, after the response).
  const needsReview =
    !existing ||
    (existing as { verification_status: string }).verification_status !== "approved";
  if (needsReview) {
    notifyTutorApplication({ tutorName: profile.full_name || "A new tutor" });
  }

  // Bio/rate render on the (cached) landing page — bust the tag.
  revalidateTag("tutors", "max");
  revalidatePath("/tutor", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/");
  return { message: "Profile saved. An admin will review it shortly." };
}

/**
 * Resolve the course a tutor is offering (0031).
 *
 * The catalog is seeded from the department's published curriculum, but it
 * will always lag reality — a new elective, a course the published tables
 * missed. A tutor can therefore add one by code, and this is where the dedupe
 * lives:
 *
 *  - The code is normalized exactly like `idx_courses_subject_code_ci`
 *    compares it, so "me  158" finds the existing "ME 158" instead of
 *    creating a twin.
 *  - A course created here is UNPUBLISHED (`is_approved = false`) — the tutor
 *    can price and teach it immediately, but the public /courses directory
 *    only shows it once an admin approves it.
 *  - If the insert loses a race with another tutor adding the same course, the
 *    unique index rejects it (23505) and we re-read the winner.
 */
async function findOrCreateCourse(
  supabase: SupabaseClient,
  input: {
    code: string;
    name: string;
    subject: string;
    year: number;
    semester: number;
    createdBy: string;
  },
): Promise<{ courseId: string; created: boolean } | { error: string }> {
  const findExisting = async () => {
    const { data } = await supabase
      .from("courses")
      .select("id")
      .eq("subject", input.subject)
      .ilike("code", input.code)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  };

  const existing = await findExisting();
  if (existing) return { courseId: existing, created: false };

  const insert = (withApproval: boolean) =>
    supabase
      .from("courses")
      .insert({
        subject: input.subject,
        name: input.name,
        code: input.code,
        year: input.year,
        semester: input.semester,
        description: null,
        ...(withApproval
          ? { is_approved: false, created_by_profile_id: input.createdBy }
          : {}),
      })
      .select("id")
      .single();

  let { data, error } = await insert(true);

  // Deployed before 0031: the approval columns don't exist yet, so the course
  // is created without them (and is therefore visible immediately — the
  // pre-0031 behaviour). Logged, because it means the migration is pending.
  if (error && isMissingColumn(error)) {
    console.warn(
      "[tutors] courses.is_approved missing — creating the course unmoderated (apply migration 0031).",
    );
    ({ data, error } = await insert(false));
  }

  if (error) {
    // 23505 = unique violation: (subject, code) or (subject, name) already
    // exists — another tutor added it between our select and insert.
    if (error.code === "23505") {
      const raced = await findExisting();
      if (raced) return { courseId: raced, created: false };
    }
    return { error: error.message };
  }

  return { courseId: (data as { id: string }).id, created: true };
}

export async function addTutorService(
  _prev: TutorFormState,
  formData: FormData,
): Promise<TutorFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor") return { error: "Only tutor accounts can do this." };

  const parsed = tutorServiceSchema.safeParse({
    courseId: formData.get("courseId"),
    newCourseCode: formData.get("newCourseCode"),
    newCourseName: formData.get("newCourseName"),
    newCourseSubject: formData.get("newCourseSubject"),
    newCourseYear: formData.get("newCourseYear"),
    newCourseSemester: formData.get("newCourseSemester"),
    priceGroup: formData.get("priceGroup"),
    priceOneOnOne: formData.get("priceOneOnOne"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the course details." };
  }

  const supabase = createAdminClient();

  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!tutorProfile) {
    return { error: "Save your tutor profile first, then add courses." };
  }

  // A filled-in course code means "add this course", and it wins over the
  // catalog picker (the form only reveals those fields when the tutor asks
  // for them).
  const code = normalizeCourseCode(parsed.data.newCourseCode);
  let courseId = parsed.data.courseId ?? null;
  let createdCourse = false;

  if (code) {
    const resolved = await findOrCreateCourse(supabase, {
      code,
      name: parsed.data.newCourseName!,
      subject: parsed.data.newCourseSubject!,
      year: parsed.data.newCourseYear!,
      semester: parsed.data.newCourseSemester!,
      createdBy: profile.id,
    });
    if ("error" in resolved) return { error: resolved.error };
    courseId = resolved.courseId;
    createdCourse = resolved.created;
  }

  if (!courseId) {
    return { error: "Pick a course, or add a new one with its course code." };
  }

  const oneOnOne = parsed.data.priceOneOnOne ?? null;
  const group = parsed.data.priceGroup ?? null;

  // `price` is NOT NULL until 0031 relaxes nothing (it stays as the legacy
  // column), so it always carries the one-on-one fee — or the group fee when
  // that is the only format the tutor offers.
  const legacyPrice = oneOnOne ?? group ?? 0;

  const row = {
    tutor_profile_id: (tutorProfile as { id: string }).id,
    course_id: courseId,
    price: legacyPrice,
    price_one_on_one: oneOnOne,
    price_group: group,
  };

  // Re-adding a course the tutor already offers RE-PRICES it rather than
  // creating a second row for the same course (there is no unique constraint
  // on (tutor_profile_id, course_id), and two rows would make the request
  // form ambiguous about which price to charge).
  const { data: existing } = await supabase
    .from("tutor_services")
    .select("id")
    .eq("tutor_profile_id", row.tutor_profile_id)
    .eq("course_id", courseId)
    .maybeSingle();

  const write = (payload: Record<string, unknown>) =>
    existing
      ? supabase
          .from("tutor_services")
          .update(payload)
          .eq("id", (existing as { id: string }).id)
      : supabase.from("tutor_services").insert(payload);

  let { error } = await write(row);

  // Deployed before 0031: only the single `price` column exists, so the
  // per-format split cannot be stored yet. The offering still saves.
  if (error && isMissingColumn(error)) {
    console.warn(
      "[tutors] tutor_services.price_group missing — saving a single price (apply migration 0031).",
    );
    ({ error } = await write({
      tutor_profile_id: row.tutor_profile_id,
      course_id: row.course_id,
      price: legacyPrice,
    }));
  }

  if (error) return { error: error.message };

  // Courses/prices render on the (cached) landing page and the course
  // directory — bust both tags.
  revalidateTag("tutors", "max");
  if (createdCourse) revalidateTag("courses", "max");
  revalidatePath("/tutor", "layout");
  revalidatePath("/courses");
  revalidatePath("/");
  return {
    message: createdCourse
      ? "Course added. It's yours to teach now; an admin reviews it before it appears in the public course directory."
      : "Course added to your services.",
  };
}
