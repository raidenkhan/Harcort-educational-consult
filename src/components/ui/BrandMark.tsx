import Image from "next/image";
import { cn } from "@/lib/cn";

/**
 * The Harcourt brand emblem — the real logo artwork (public/logo.png,
 * transparent background, brand-purple ink; derived from public/logo.jpg
 * via scripts/make-logo-transparent.mjs). `variant="white"` uses the
 * white-ink derivative (logo-white.png) for dark surfaces like the footer.
 *
 * The source emblem is 308x397 (taller than wide); sizes below set height
 * and derive width from the same aspect ratio so the artwork never
 * distorts.
 */
const SIZES = {
  sm: { height: 32, width: 25, className: "h-8 w-auto" },
  md: { height: 36, width: 28, className: "h-9 w-auto" },
  lg: { height: 48, width: 37, className: "h-12 w-auto" },
  xl: { height: 56, width: 43, className: "h-14 w-auto" },
} as const;

export function BrandMark({
  size = "md",
  variant = "color",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  /** "color" = brand-purple ink (light surfaces); "white" = white ink. */
  variant?: "color" | "white";
  className?: string;
}) {
  const dims = SIZES[size];
  return (
    <Image
      src={variant === "white" ? "/logo-white.png" : "/logo.png"}
      alt=""
      aria-hidden="true"
      width={dims.width}
      height={dims.height}
      priority
      className={cn("select-none", dims.className, className)}
    />
  );
}
