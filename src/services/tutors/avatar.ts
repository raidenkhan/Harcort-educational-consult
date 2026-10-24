"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TUTOR_AVATAR_BUCKET,
  tutorAvatarPathFromUrl,
  tutorAvatarPublicUrl,
} from "@/lib/supabase/storage";
import { requireProfile } from "@/services/auth/queries";
import { validateAvatarFile } from "./avatarFile";

/**
 * Tutor profile photo (0035).
 *
 * The upload runs entirely server-side (the browser holds no Supabase key):
 * validate the file, resize it to a small square WebP with sharp, put it in
 * the PUBLIC `tutor-avatars` bucket, and store the public URL in
 * `profiles.avatar_url` — the same column Google sign-in fills, so the photo
 * shows wherever the user's picture is expected (directory cards, profile).
 *
 * The bucket is created on first use (`ensureTutorAvatarBucket`), so a fresh
 * environment self-heals rather than 404ing.
 */

export type AvatarFormState = { error?: string; message?: string; url?: string };

async function ensureTutorAvatarBucket(): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.createBucket(TUTOR_AVATAR_BUCKET, {
    public: true,
  });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    // Not fatal — the upload below surfaces a clearer error if it still fails.
    console.error("[avatar] createBucket failed", error);
  }
}

export async function uploadTutorAvatarAction(
  _prev: AvatarFormState | undefined,
  formData: FormData,
): Promise<AvatarFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor") {
    return { error: "Only tutor accounts can set a profile photo." };
  }

  const file = formData.get("avatar");
  if (!file || typeof file === "string") {
    return { error: "Choose a photo to upload." };
  }

  const invalid = validateAvatarFile({ type: file.type, size: file.size });
  if (invalid) return { error: invalid };

  const original = Buffer.from(await file.arrayBuffer());

  // Resize to a 512×512 cover square and re-encode as WebP. Phone photos are
  // 4+ MB and 4000px wide; a card needs ~100px. If sharp can't process a
  // type-valid-but-odd file, fall back to the original bytes so the upload
  // still succeeds rather than failing on a transform.
  let bytes = original;
  let contentType = "image/webp";
  try {
    bytes = await sharp(original)
      .rotate() // honour EXIF orientation
      .resize(512, 512, { fit: "cover" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    contentType = file.type || "application/octet-stream";
  }

  await ensureTutorAvatarBucket();

  const supabase = createAdminClient();
  const path = `avatars/${profile.id}-${Date.now()}.webp`;

  const { error } = await supabase.storage
    .from(TUTOR_AVATAR_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });

  if (error) {
    console.error("[avatar] upload failed", error);
    return {
      error: "We couldn't save that photo. Try again, or use a smaller image.",
    };
  }

  const url = tutorAvatarPublicUrl(path);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq("id", profile.id);

  if (updateError) {
    console.error("[avatar] profiles update failed", updateError);
    return {
      error: "The photo uploaded, but we couldn't attach it. Please try again.",
    };
  }

  // Best-effort: drop the previous object so replaced photos don't pile up.
  // Only OUR paths — never a Google avatar URL.
  const oldPath = tutorAvatarPathFromUrl(profile.avatar_url);
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(TUTOR_AVATAR_BUCKET).remove([oldPath]);
  }

  // The avatar renders on the (cached) directory, the profile page and the
  // dashboard — invalidate the listing tag and the paths.
  revalidateTag("tutors", "max");
  revalidatePath("/tutors", "layout");
  revalidatePath("/tutor", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/");

  return { message: "Profile photo updated.", url };
}
