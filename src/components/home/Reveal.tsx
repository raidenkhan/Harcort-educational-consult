"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Scroll reveal — animates a block in the first time it enters the viewport.
 *
 * Variants (transform + opacity + filter only — GPU-friendly):
 *  - "up"    fade + rise (default — safe everywhere)
 *  - "left"  fly in from the left
 *  - "right" fly in from the right
 *  - "pop"   scale up from 90% (chips, cards)
 *  - "blur"  rise + focus — the blur clears (manifesto text, empty states)
 *
 * Motion decisions (see .agents/skills/animate):
 *  - Purpose: preventing a jarring pop-in on marketing sections seen rarely;
 *    direction variants also carry meaning (content flowing in from where
 *    the reading eye travels).
 *  - Tool: CSS transition (retargetable) driven by one IntersectionObserver —
 *    no library, transform + opacity + filter only.
 *  - Curve/duration: the shared `--ease-out` token at 500ms; this is a
 *    marketing reveal, which may exceed the 300ms UI budget.
 *  - Reduced motion: opacity only, no movement or blur.
 *  - Runs once (`once: true`); never blocks interaction — content is fully
 *    clickable while the reveal plays.
 */

export type RevealVariant = "up" | "left" | "right" | "pop" | "blur";

const HIDDEN: Record<RevealVariant, string> = {
  up: "translate-y-6",
  left: "-translate-x-10",
  right: "translate-x-10",
  pop: "scale-90",
  blur: "translate-y-4 blur-sm",
};

/** Shown state resets every axis a variant may have hidden on. */
const SHOWN = "translate-x-0 translate-y-0 scale-100 opacity-100 blur-none";

const REDUCE_RESET =
  "motion-reduce:translate-x-0 motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:blur-none";

export function Reveal({
  children,
  className,
  delay = 0,
  variant = "up",
}: {
  children: React.ReactNode;
  className?: string;
  /** Extra transition-delay in ms — keep staggers small (30–80ms steps). */
  delay?: number;
  variant?: RevealVariant;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Skip the observer entirely when IntersectionObserver is missing —
    // content must never be hidden forever. Mutate the element directly
    // rather than setState: this effect body runs once, and a synchronous
    // setState here would cascade a second render for no benefit.
    if (typeof IntersectionObserver === "undefined") {
      el.style.opacity = "1";
      el.style.transform = "none";
      el.style.filter = "none";
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        "transition-[opacity,transform,filter] duration-500 [transition-timing-function:var(--ease-out)] motion-reduce:transition-opacity motion-reduce:duration-300",
        shown ? SHOWN : cn(HIDDEN[variant], "opacity-0", REDUCE_RESET),
        className,
      )}
    >
      {children}
    </div>
  );
}
