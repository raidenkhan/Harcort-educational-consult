import { cn } from "@/lib/cn";

/**
 * The Harcourt H monogram — the amber→petrol gradient square with a white H
 * used in the logo mark and the favicon. Standalone on auth screens, empty
 * states, and anywhere the brand should anchor the eye.
 */
export function BrandMark({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-petrol-700 font-display font-bold text-white shadow-xs",
        size === "sm" && "h-8 w-8 text-sm",
        size === "md" && "h-9 w-9 text-sm",
        size === "lg" && "h-12 w-12 text-xl",
        size === "xl" && "h-14 w-14 text-2xl",
        className,
      )}
    >
      H
    </span>
  );
}
