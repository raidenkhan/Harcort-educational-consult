import { cn } from "@/lib/cn";

/**
 * 3D perspective grid horizon — a CSS plane rotated into the distance, with a
 * purple light beam above it.
 *
 * This is the "dark mode tech" backdrop idea from the design brief, re-tuned
 * for the light lilac canvas the rest of the app uses: the grid lines are brand
 * ink at low alpha (not white), so sections keep their dark text and white
 * cards. `strength` scales the line and beam intensity (0–1); bands further
 * down a long page take progressively lower values so the horizon recedes
 * rather than repeating at full strength. Drop it as the first child of a
 * `relative` block and it fills the top
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
 *  - The shimmer is the one animation, and it is deliberately cheap and
 *    seamless: `grid-pan` slides `background-position` by exactly one 56px
 *    tile per 26s loop (the background repeats at 56px, so the loop has no
 *    visible seam), and `grid-breathe` slowly dims/brightens the band. Both
 *    run in a single `animation` declaration — two animation *shorthands*
 *    on one element override each other, so the combined value goes in one
 *    arbitrary property. Disabled for `prefers-reduced-motion` (utility on
 *    the element plus the global reduced-motion override in globals.css as
 *    a second net).
 *  - If you ever change `backgroundSize`, change the `grid-pan` keyframe to
 *    the same value or the loop will visibly snap.
 *  - Never split the shimmer into two `animate-*` utilities — see the
 *    shorthand-override note above.
 */
export function PerspectiveGrid({
  tone = "petrol",
  beam = true,
  strength = 1,
  className,
}: {
  tone?: "purple" | "petrol";
  /** The purple radial light beam above the horizon. One per page reads best. */
  beam?: boolean;
  /**
   * Overall intensity of the lines AND the beam (0 = invisible, 1 = default).
   * Bands lower on a long page take progressively lower values so the horizon
   * recedes instead of repeating at full strength all the way down.
   */
  strength?: number;
  className?: string;
}) {
  const line =
    tone === "purple"
      ? `rgba(91, 14, 137, ${(0.11 * strength).toFixed(3)})` // brand-600 ink
      : `rgba(28, 15, 43, ${(0.11 * strength).toFixed(3)})`; // petrol-900 ink

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
      {/* Radial light beam from the top centre. The Tailwind class stays at
          full strength and the element's own opacity scales the whole thing,
          so the blur radius and footprint don't change with `strength`. */}
      {beam && (
        <div
          className="absolute -top-24 left-1/2 h-[300px] w-[620px] -translate-x-1/2 rounded-full bg-brand-600/10 blur-[120px]"
          style={{ opacity: strength }}
        />
      )}

      {/* The receding grid plane, drifting one seamless 56px cell per 26s
          loop while the band slowly breathes (0.65 -> 0.45 opacity) — both
          in ONE animation shorthand. Two shorthand utilities on the same
          element override each other (the second wins and the first dies
          silently), so the combined value lives in a plain Tailwind
          arbitrary property instead of two utilities. The pan animates
          `background-position`, so the load-bearing inline `transform` is
          never touched. `motion-reduce:animate-none` is the first line of
          defence; the global reduced-motion override in globals.css freezes
          the keyframes as the second. */}
      <div
        className="absolute inset-0 [animation:grid-pan_26s_linear_infinite,grid-breathe_13s_ease-in-out_infinite] motion-reduce:animate-none"
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
