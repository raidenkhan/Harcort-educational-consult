/**
 * Avatar upload validation — pure, so the same rules the server action applies
 * can be unit-tested without touching sharp, Supabase or a File object.
 */

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
export const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarFileShape = { type: string; size: number };

/** An error message, or null when the file is acceptable. */
export function validateAvatarFile(file: AvatarFileShape): string | null {
  if (!file.type || file.size <= 0) {
    return "Choose a photo to upload.";
  }
  if (!(ALLOWED_AVATAR_TYPES as readonly string[]).includes(file.type)) {
    return "Use a JPG, PNG or WebP image.";
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return "That photo is too large — use one under 2 MB.";
  }
  return null;
}
