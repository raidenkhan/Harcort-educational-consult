"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/cn";

/**
 * BounceDeck — React Bits' `BounceCards` reworked for content cards.
 *
 * Kept from the original: the gsap elastic bounce-in (`elastic.out(1, 0.5)`)
 * staggered per card, and the hover interaction — hovered card straightens
 * (back.out), siblings get pushed aside with a distance-based delay.
 *
 * Changed for this page:
 *  - Children are React nodes, not image URLs; cards stay in normal grid
 *    flow so the section remains responsive and readable.
 *  - The fan + hover-push only apply from `lg` up (gsap.matchMedia) — on a
 *    single phone column, tilted/translated cards read as broken layout.
 *  - Entrance fires once on scroll-into-view (original fired on mount —
 *    invisible below the fold), and hydration pre-hides the cards so they
 *    can't flash before the bounce.
 *  - `prefers-reduced-motion`: no gsap work at all — static, straight cards.
 *  - Movement is dialled down (±20px fan, 26px push) so it reads as
 *    polish rather than noise; class-based selectors replaced with refs.
 */

const FAN = [
  "rotate(-2deg) translate(-20px)",
  "rotate(1.2deg) translate(-7px)",
  "rotate(-1.2deg) translate(7px)",
  "rotate(2deg) translate(20px)",
];

const PUSH_PX = 26;
const PUSH_EASE = "back.out(1.4)";

export function BounceDeck({
  children,
  className,
  stagger = 0.09,
}: {
  children: ReactNode[];
  className?: string;
  /** Seconds between each card's bounce (React Bits: animationStagger). */
  stagger?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const playedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return; // static render — no gsap, no fan, no listeners
    }

    const els = cardRefs.current.filter(
      (el): el is HTMLDivElement => el !== null,
    );
    if (els.length === 0) return;

    /** Resolve the fan transform for card `i`, pushed by `offsetPx`. */
    const fanTransform = (i: number, offsetPx = 0) => {
      const base = FAN[i] ?? "none";
      if (!offsetPx) return base;
      const m = base.match(/translate\((-?[\d.]+)px\)/);
      const x = (m ? parseFloat(m[1]) : 0) + offsetPx;
      return base.replace(
        /translate\((-?[\d.]+)px\)/,
        `translate(${x}px)`,
      );
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || playedRef.current)
          return;
        playedRef.current = true;
        observer.disconnect();
        gsap.fromTo(
          els,
          { scale: 0, autoAlpha: 0 },
          {
            scale: 1,
            autoAlpha: 1,
            duration: 0.9,
            ease: "elastic.out(1, 0.5)",
            stagger,
            delay: 0.15,
          },
        );
      },
      { threshold: 0.25 },
    );
    observer.observe(container);

    // Fan + hover-push exist only on desktop-width layouts. The bounce
    // tween composes with the fan: gsap parses the set transform into
    // rotation/x components and animates scale on top of them.
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      els.forEach((el, i) => {
        gsap.set(el, { transform: fanTransform(i) });
      });

      const straighten = /rotate\([^)]*\)/;
      const onEnter = (hovered: number) => () => {
        els.forEach((el, i) => {
          const target =
            i === hovered
              ? fanTransform(i).replace(straighten, "rotate(0deg)")
              : fanTransform(i, i < hovered ? -PUSH_PX : PUSH_PX);
          gsap.to(el, {
            transform: target,
            duration: 0.4,
            delay: i === hovered ? 0 : Math.abs(hovered - i) * 0.04,
            ease: PUSH_EASE,
            overwrite: "auto",
          });
        });
      };
      const onLeave = () => {
        els.forEach((el, i) => {
          gsap.to(el, {
            transform: fanTransform(i),
            duration: 0.4,
            ease: PUSH_EASE,
            overwrite: "auto",
          });
        });
      };

      const offs = els.map((el, i) => {
        const enter = onEnter(i);
        el.addEventListener("mouseenter", enter);
        el.addEventListener("mouseleave", onLeave);
        return () => {
          el.removeEventListener("mouseenter", enter);
          el.removeEventListener("mouseleave", onLeave);
        };
      });
      return () => offs.forEach((off) => off());
    });

    return () => {
      observer.disconnect();
      mm.revert();
    };
  }, [stagger]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "grid gap-6 sm:grid-cols-2 lg:grid-cols-4",
        // Room for the pushed cards so they never clip mid-hover.
        "lg:px-10",
        className,
      )}
    >
      {children.map((child, i) => (
        <div
          key={i}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          className="min-w-0 motion-safe:opacity-0 will-change-transform"
        >
          {child}
        </div>
      ))}
    </div>
  );
}
