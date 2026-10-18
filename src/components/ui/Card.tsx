import { cn } from "@/lib/cn";

/**
 * The app's one card language: hairline border on the canvas, no elevation.
 * Depth comes from surface contrast (white → canvas → tinted walls → ink),
 * matching the landing's Letter language instead of adding a second one;
 * a 1px border under a wide soft shadow is the ghost-card look. Anything
 * that genuinely floats (modal, nav pill, dropdown) declares `shadow-lift`
 * itself — elevation is declared once, and only by things that hover.
 */
export function Card({
  className,
  children,
  padded = true,
  hover = false,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white",
        padded && "p-6",
        hover && "transition-colors duration-200 hover:border-slate-300",
        className,
      )}
    >
      {children}
    </div>
  );
}
