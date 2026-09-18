"use client";

import { useState } from "react";
import { BorderBeam } from "border-beam";

/**
 * BeamCard — wraps a landing card with the border-beam glow.
 *
 * Client boundary: `border-beam` uses hooks but does NOT declare
 * "use client" in its dist, so server pages must import THIS wrapper,
 * never the package directly. Server-rendered children pass through as
 * serialized RSC nodes.
 *
 * Brand color: the package only ships named palettes (colorful/ocean/
 * sunset/mono), but its shader reads `var(--beam-hue-base, 0deg)` with a
 * fallback — so `hue` sets that CSS variable on a wrapper and the beam
 * renders in Harcourt purple (~275°) instead of package blue. `hueRange`
 * (both the CSS var and the official prop) narrows the hue-shift swing so
 * the animation stays inside the purple band instead of cycling rainbow.
 *
 * Modes:
 *  - "hover" (default): the beam fades in only while the pointer is on
 *    the card — intriguing on approach, silent at rest.
 *  - "always": continuous, at low strength, for ambient emphasis.
 */
export function BeamCard({
  children,
  className,
  mode = "hover",
  size = "md",
  colorVariant = "colorful",
  theme = "light",
  strength = 0.55,
  borderRadius = 2,
  hue,
  hueRange = 14,
}: {
  children: React.ReactNode;
  className?: string;
  mode?: "hover" | "always";
  size?: "md" | "sm" | "line" | "pulse-inner" | "pulse-outside";
  colorVariant?: "colorful" | "mono" | "ocean" | "sunset";
  theme?: "light" | "dark" | "auto";
  /** Glow intensity 0–1 — keep ≤0.6 on the landing. */
  strength?: number;
  borderRadius?: number;
  /** Hue (degrees) for the beam — Harcourt purple is ~275. */
  hue?: number;
  /** Hue-shift swing in degrees; small keeps the beam on-brand. */
  hueRange?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const active = mode === "always" || hovered;

  const beam = (
    <BorderBeam
      size={size}
      colorVariant={colorVariant}
      theme={theme}
      strength={strength}
      borderRadius={borderRadius}
      hueRange={hueRange}
      active={active}
      onMouseEnter={mode === "hover" ? () => setHovered(true) : undefined}
      onMouseLeave={mode === "hover" ? () => setHovered(false) : undefined}
      className={className}
    >
      {children}
    </BorderBeam>
  );

  if (hue === undefined) return beam;

  // CSS vars inherit through the DOM; the shader's var(--beam-hue-base)
  // picks these up unless the package sets them inline itself.
  return (
    <div
      style={
        {
          "--beam-hue-base": `${hue}deg`,
          "--beam-hue-range": `${hueRange}deg`,
        } as React.CSSProperties
      }
    >
      {beam}
    </div>
  );
}
