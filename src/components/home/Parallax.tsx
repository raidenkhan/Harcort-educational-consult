"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Parallax — drifts a block vertically as the page scrolls (subtle depth on
 * decorative layers: backdrops, glows, oversized display type).
 *
 * Motion decisions (see .agents/skills/animate):
 *  - Purpose: depth, not attention — reserved for background/decorative
 *    layers, never for content the user is reading (content must not move
 *    under a cursor chasing it).
 *  - Magnitude: `speed` is the fraction of the viewport the element drifts
 *    across its full pass — 0.1–0.2 keeps it felt-but-subtle.
 *  - Tool: transform only (GPU), mutated inside a single rAF while the
 *    element is intersecting the viewport; the scroll listener is passive.
 *  - Reduced motion: no effect at all — static render.
 */
export function Parallax({
  children,
  className,
  /** Fraction of viewport height the element drifts across its pass. */
  speed = 0.15,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let inView = false;
    let visible = false;

    const update = () => {
      raf = 0;
      if (!inView) return;
      const vh = window.innerHeight;
      const rect = el.getBoundingClientRect();
      // 0 = element's top at the viewport bottom; 1 = bottom at viewport top.
      const progress = (vh - rect.top) / (vh + rect.height);
      const clamped = Math.min(1, Math.max(0, progress));
      const y = (0.5 - clamped) * speed * vh;
      el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    };

    const requestUpdate = () => {
      if (!raf) raf = window.requestAnimationFrame(update);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        inView = entries.some((e) => e.isIntersecting);
        if (inView) {
          if (!visible) {
            visible = true;
            update(); // position correctly before the first scroll
          }
          window.addEventListener("scroll", requestUpdate, { passive: true });
        } else {
          window.removeEventListener("scroll", requestUpdate);
        }
      },
      { rootMargin: "20% 0px" },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [speed]);

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
