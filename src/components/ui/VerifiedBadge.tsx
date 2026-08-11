import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Twitter-style verified badge for Harcot admin accounts — a solid petrol
 * circle with a white check. Inline span so it sits next to names; carries
 * a title + aria-label for screen readers.
 */
export function VerifiedBadge({
  className,
  label = "Verified admin",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-petrol-600 text-white",
        className,
      )}
    >
      <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
    </span>
  );
}
