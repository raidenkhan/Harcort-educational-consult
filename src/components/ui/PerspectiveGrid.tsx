import { cn } from "@/lib/cn";

/**
 * 3D perspective grid horizon — a CSS plane rotated into the distance, with a
 * purple light beam above it.
 *
 * This is the "dark mode tech" backdrop idea from the design brief, re-tuned
 * for the light lilac canvas the rest of the app uses: the grid lines are brand
 * ink at low alpha (not white), so sections keep their dark text and white
 * cards. Drop it as the first child of a `relative` block and it fills the top
 * of that block, behind the content (pass `-z-10` when the parent is not a
 * stacking context).
 *
 * Geometry notes for future edits — the transform is deliberately the same
 * plane as the brief (`perspective(500px) rotateX(60deg) translateY(-100px)
 * scale(2)`, origin top center):
 *
 *  - Do NOT stretch the plane to cover a tall region. The plane crosses the
 *    perspective camera at ~338px of element height (2y - 100 = 500 / sin60),
 *    past which the projection inverts and the lines smear. The band stays
 *    short and the mask fades it out at 310px, before that limit, so the
 *    wasted projection is never visible.
 *  - The mask therefore uses px stops, not percentages: the visible depth must
 *    not move when the wrapper's height changes at a breakpoint.
 *  - Everything per-instance (line colour, transform, mask) is an inline style.
 *    Tailwind only compiles class names it can read as literal strings, so
 *    interpolating values into class names silently produces no CSS.
 *  - Static by design: no animation, so there is nothing for
 *    `prefers-reduced-motion` to switch off.
 */
export function PerspectiveGrid({
  tone = "petrol",
  beam = true,
  className,
}: {
  tone?: "purple" | "petrol";
  /** The purple radial light beam above the horizon. One per page reads best. */
  beam?: boolean;
  className?: string;
}) {
  const line =
    tone === "purple"
      ? "rgba(91, 14, 137, 0.11)" // brand-600 ink
      : "rgba(28, 15, 43, 0.11)"; // petrol-900 ink

  const mask =
    "linear-gradient(to bottom, rgba(0,0,0,1) 0px, rgba(0,0,0,0.55) 150px, rgba(0,0,0,0) 310px)";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden sm:h-[520px]",
        className,
      )}
    >
      {/* Radial light beam from the top centre. */}
      {beam && (
        <div className="absolute -top-24 left-1/2 h-[300px] w-[620px] -translate-x-1/2 rounded-full bg-brand-600/10 blur-[120px]" />
      )}

      {/* The receding grid plane. */}
      <div
        className="absolute inset-0 opacity-[0.65]"
        style={{
          backgroundImage: `linear-gradient(to right, ${line} 1px, transparent 1px), linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
          backgroundSize: "56px 56px",
          transform:
            "perspective(500px) rotateX(60deg) translateY(-100px) scale(2)",
          transformOrigin: "top center",
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    </div>
  );
}
