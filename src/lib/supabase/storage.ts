/**
 * Supabase Storage — tutor profile photos.
 *
 * The avatar lives in a PUBLIC bucket, so the browser loads it by plain URL
 * with no Supabase key (this app has no anon key: every write is server-side
 * through the service role, every read is a same-origin `next/image` URL).
 * Public buckets are served at `/storage/v1/object/public/<bucket>/<path>`
 * with no auth.
 *
 * `profiles.avatar_url` holds "a URL to this user's picture" — a Google
 * picture for accounts that signed in with Google, or one of our bucket URLs
 * for a tutor who uploaded a photo. `isTutorAvatarUrl()` tells them apart:
 * a Google URL is NOT one we can vouch for (host not in the image allowlist),
 * so the UI falls back to initials instead of rendering a broken image.
 *
 * Kept free of the service-role client so it is safe to import from client
 * components (`TutorAvatar`) as well as server actions. The env read is a
 * function (not a module-level const) so tests can seed it.
 */

export const TUTOR_AVATAR_BUCKET = "tutor-avatars";

function storageBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

/** The public prefix of every object in the avatar bucket. */
function avatarBucketPrefix(): string {
  return `${storageBaseUrl()}/storage/v1/object/public/${TUTOR_AVATAR_BUCKET}/`;
}

/** Public URL for a stored object (world-readable, no key). */
export function tutorAvatarPublicUrl(path: string): string {
  return `${avatarBucketPrefix()}${path}`;
}

/** True when `url` is one of OUR uploaded avatars (vs a Google picture/null). */
export function isTutorAvatarUrl(url: string | null | undefined): boolean {
  if (!url || !storageBaseUrl()) return false;
  return url.startsWith(avatarBucketPrefix());
}

/** The object path out of one of our avatar URLs (for deleting on replace). */
export function tutorAvatarPathFromUrl(
  url: string | null | undefined,
): string | null {
  if (!isTutorAvatarUrl(url)) return null;
  return (url as string).slice(avatarBucketPrefix().length);
}
