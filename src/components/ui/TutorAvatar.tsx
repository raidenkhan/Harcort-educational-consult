import Image from "next/image";
import { cn } from "@/lib/cn";
import { isTutorAvatarUrl } from "@/lib/supabase/storage";

/**
 * A tutor's profile picture — the uploaded photo when there is one, otherwise
 * a monogram (first + last initial) on the brand ink.
 *
 * Only OUR uploaded avatars render as images: a `profiles.avatar_url` set by
 * Google sign-in points at a host that isn't in the image allowlist, and
 * `isTutorAvatarUrl()` rejects it so the card shows initials instead of a
 * broken <img>. (A blob:/data: preview URL is handled by the upload form
 * directly, not here.)
 */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function TutorAvatar({
  name,
  src,
  size = 44,
  className,
}: {
  name: string;
  src?: string | null;
  /** Rendered size in px (square). */
  size?: number;
  className?: string;
}) {
  const showImage = isTutorAvatarUrl(src);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-slate-900 font-display font-bold text-white",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showImage && src ? (
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.38) }}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
