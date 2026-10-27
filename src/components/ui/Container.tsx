import { cn } from "@/lib/cn";

/**
 * The app's one content gutter.
 *
 * Phones get a tighter 16px gutter (the 24px one ate 12% of a 360px screen and
 * made every card feel narrow); tablets and up keep the roomier 24px.
 */
export function Container({
  className,
  children,
  size = "default",
}: {
  className?: string;
  children: React.ReactNode;
  size?: "default" | "wide" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 sm:px-6",
        size === "wide" && "max-w-7xl",
        size === "default" && "max-w-6xl",
        size === "narrow" && "max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
