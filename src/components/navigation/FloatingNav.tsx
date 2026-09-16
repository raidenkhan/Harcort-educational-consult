"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Logo } from "@/components/ui/Logo";

/**
 * Floating glass navigation bar.
 *
 * Sits *over* the page (fixed) rather than occupying flow, so the hero
 * gradient can run edge-to-edge behind it. It condenses away when the visitor
 * scrolls down and glides back on the first upward scroll — the same
 * large-header pattern iOS and most apps use. Reveal is instant (one rAF),
 * motion is a single transform at 300ms with the shared ease-out curve, and
 * `prefers-reduced-motion` drops the transition entirely.
 *
 * It stays a light glass pill at every scroll position so the content inside
 * it (logo, links, whatever actions a page passes as children) keeps one set
 * of colours — no light-on-dark/ dark-on-light switching.
 *
 * Keyboard safety: `focus-within` forces the bar back on screen, so tabbing
 * into a hidden link can never strand focus off-canvas.
 *
 * Mobile geometry is deliberately tighter (12px page gutter, 9px/13px actions,
 * and the Logo drops its subtitle below `sm`) so two actions — e.g. Sign in +
 * the primary CTA — fit in one row on a 320px screen instead of collapsing
 * into a menu.
 */
export function FloatingNav({
  links,
  children,
  hideOnScroll = true,
  className,
}: {
  links?: { href: string; label: string }[];
  /** Right-hand side: auth buttons, sign-out form, user chip, … */
  children?: React.ReactNode;
  hideOnScroll?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let queued = false;
    let frame = 0;

    const read = () => {
      queued = false;
      const y = window.scrollY;
      setScrolled(y > 12);

      if (!hideOnScroll) {
        lastY = y;
        return;
      }
      const delta = y - lastY;
      // Ignore sub-pixel jitter so the bar can't flicker mid-scroll.
      if (Math.abs(delta) > 6) {
        setHidden(delta > 0 && y > 220);
        lastY = y;
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [hideOnScroll]);

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-3 z-40 flex justify-center px-3 sm:px-6",
        "transition-transform duration-300 ease-out motion-reduce:transition-none",
        "focus-within:translate-y-0",
        hidden && "-translate-y-[calc(100%+1.5rem)]",
        className,
      )}
    >
      <nav
        aria-label="Primary"
        className={cn(
          "flex h-14 w-full max-w-6xl items-center justify-between gap-2 rounded-full border pl-3 pr-1.5 sm:gap-3 sm:pl-3.5 sm:pr-2",
          "transition-[background-color,border-color,box-shadow] duration-300 ease-out motion-reduce:transition-none",
          scrolled
            ? "border-slate-200/80 bg-white/85 shadow-lift backdrop-blur-xl"
            : "border-white/40 bg-white/70 shadow-sm backdrop-blur-md",
        )}
      >
        <div className="flex min-w-0 items-center gap-7">
          <Logo />
          {links && links.length > 0 && (
            <ul className="hidden items-center gap-6 md:flex">
              {links.map((link) => {
                const active =
                  link.href !== "/" &&
                  (pathname === link.href || pathname.startsWith(`${link.href}/`));
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative inline-block py-1 text-sm font-medium transition-colors duration-150",
                        active
                          ? "text-slate-900"
                          : "text-slate-600 hover:text-slate-900",
                      )}
                    >
                      {link.label}
                      {/* Underline grows from the left on hover — one transform,
                          no layout shift. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute -bottom-0.5 left-0 h-0.5 w-full origin-left rounded-full bg-brand-600",
                          "transition-transform duration-200 ease-out motion-reduce:transition-none",
                          active
                            ? "scale-x-100"
                            : "scale-x-0 group-hover:scale-x-100",
                        )}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {children}
        </div>
      </nav>
    </div>
  );
}
