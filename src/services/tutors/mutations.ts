"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTutorApplication } from "@/lib/email/notify";
import { isMissingColumn } from "@/lib/postgres";
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

export async function addTutorService(
  _prev: TutorFormState,
  formData: FormData,
): Promise<TutorFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor") return { error: "Only tutor accounts can do this." };

  const parsed = tutorServiceSchema.safeParse({
    courseId: formData.get("courseId"),
    price: formData.get("price"),
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

  const { error } = await supabase.from("tutor_services").insert({
    tutor_profile_id: (tutorProfile as { id: string }).id,
    course_id: parsed.data.courseId,
    price: parsed.data.price,
  });

  if (error) return { error: error.message };

  // Courses/prices render on the (cached) landing page — bust the tag.
  revalidateTag("tutors", "max");
  revalidatePath("/tutor", "layout");
  revalidatePath("/");
  return { message: "Course added to your services." };
}
