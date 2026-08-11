"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
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
    ratePerHour: formData.get("ratePerHour"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const supabase = createAdminClient();

  // Fetch the existing tutor profile to decide insert vs update.
  const { data: existing } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const payload = {
    bio: parsed.data.bio,
    qualifications: parsed.data.qualifications,
    rate_per_hour: parsed.data.ratePerHour,
  };

  const { error } = existing
    ? await supabase
        .from("tutor_profiles")
        .update(payload)
        .eq("id", (existing as { id: string }).id)
    : await supabase.from("tutor_profiles").insert({
        ...payload,
        profile_id: profile.id,
      });

  if (error) return { error: error.message };

  revalidatePath("/tutor");
  revalidatePath("/dashboard");
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

  revalidatePath("/tutor");
  return { message: "Course added to your services." };
}
