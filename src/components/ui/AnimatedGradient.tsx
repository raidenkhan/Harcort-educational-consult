"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Animated gradient backdrop — slow-drifting radial colour blobs blended over
 * a fixed linear gradient, plus a soft blob that eases toward the cursor.
 *
 * Drop it as the first child of a `relative overflow-hidden` section: it is
 * absolutely positioned and `pointer-events-none`, so it never swallows clicks
 * on the content above it. Colours default to the Harcourt purple palette
 * (deep navy-purple ink → vivid purple, with lilac highlights).
 *
 * Notes for future edits: everything that varies per instance (blur filter id,
 * blob colours, geometry) is set through inline styles. Tailwind only compiles
 * class names it can see as literal strings in the source, so interpolating a
 * value into a class name silently produces no CSS. Only the `animate-*`
 * utilities are passed as classes, and those are literal.
 *
 * Motion is skipped for `prefers-reduced-motion: reduce` and for coarse
 * pointers, and the global reduced-motion override in globals.css freezes the
 * blob keyframes as a second safety net.
 */

const BRAND = {
  start: "rgb(28, 15, 43)", // petrol-900 — deep navy-purple ink
  end: "rgb(76, 8, 120)", // brand-700 — vivid purple
  first: "97, 11, 150", // brand-600
  second: "175, 136, 227", // lilac-400
  third: "76, 8, 120", // brand-700
  fourth: "209, 180, 239", // lilac-200
  fifth: "150, 70, 198", // brand-500
  pointer: "196, 163, 237", // lilac-300
} as const;

function radial(color: string, opacity: string): string {
  return `radial-gradient(circle at center, rgba(${color}, ${opacity}) 0, rgba(${color}, 0) 50%) no-repeat`;
}

export function AnimatedGradient({
  className,
  interactive = true,
  size = "80%",
  blending = "hard-light",
  colors,
}: {
  className?: string;
  interactive?: boolean;
  /** Blob diameter, e.g. "80%". */
  size?: string;
  /** CSS mix-blend-mode applied to the blob layer. */
  blending?: CSSProperties["mixBlendMode"];
  colors?: Partial<typeof BRAND>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  // Sanitised so the value is safe inside `url(#…)` (useId returns ":r0:").
  const filterId = `ag${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const palette = { ...BRAND, ...colors };

  useEffect(() => {
    if (!interactive) return;
    const root = rootRef.current;
    const blob = pointerRef.current;
    if (!root || !blob) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReduced || coarsePointer) return;

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;
    let running = false;

    const step = () => {
      const dx = targetX - currentX;
      const dy = targetY - currentY;
      currentX += dx / 20;
      currentY += dy / 20;
      blob.style.transform = `translate3d(${Math.round(currentX)}px, ${Math.round(
        currentY,
      )}px, 0)`;

      // Settle once the blob has caught up; a fresh mousemove restarts it.
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        running = false;
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const onMove = (event: MouseEvent) => {
      const rect = root.getBoundingClientRect();
      targetX = event.clientX - rect.left - rect.width / 2;
      targetY = event.clientY - rect.top - rect.height / 2;
      if (!running) {
        running = true;
        frame = requestAnimationFrame(step);
      }
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [interactive]);

  const blobs = [
    { color: palette.first, animation: "animate-gradient-first", opacity: 1, origin: "center center" },
    { color: palette.second, animation: "animate-gradient-second", opacity: 1, origin: "calc(50% - 400px)" },
    { color: palette.third, animation: "animate-gradient-third", opacity: 1, origin: "calc(50% + 400px)" },
    { color: palette.fourth, animation: "animate-gradient-fourth", opacity: 0.7, origin: "calc(50% - 200px)" },
    { color: palette.fifth, animation: "animate-gradient-fifth", opacity: 1, origin: "calc(50% - 800px) calc(50% + 800px)" },
  ];

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      style={{
        backgroundImage: `linear-gradient(40deg, ${palette.start}, ${palette.end})`,
      }}
    >
      <svg className="hidden" focusable="false">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div
        className="absolute inset-0"
        style={{ filter: `url(#${filterId}) blur(40px)` }}
      >
        {blobs.map((blob) => (
          <div
            key={blob.color}
            className={cn("absolute", blob.animation)}
            style={{
              width: size,
              height: size,
              left: `calc(50% - ${size} / 2)`,
              top: `calc(50% - ${size} / 2)`,
              opacity: blob.opacity,
              transformOrigin: blob.origin,
              mixBlendMode: blending,
              background: radial(blob.color, "0.8"),
            }}
          />
        ))}

        {interactive && (
          <div
            ref={pointerRef}
            className="absolute h-full w-full opacity-70 will-change-transform"
            style={{
              top: "-50%",
              left: "-50%",
              mixBlendMode: blending,
              background: radial(palette.pointer, "0.8"),
            }}
          />
        )}
      </div>
    </div>
  );
}
