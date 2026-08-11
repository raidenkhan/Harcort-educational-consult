"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  GraduationCap,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserRole } from "@/types";

/**
 * App-like bottom tab bar for mobile (hidden on lg+ where the top nav takes
 * over). Role-aware: students get Home / Find tutors / Messages, tutors add
 * My profile, admins get Home / Admin.
 *
 * Motion follows the frequency gate: tab switching is a "tens of times per
 * day" interaction, so everything stays fast and subtle — a 200ms ease-out
 * sliding accent line (transform/opacity only, GPU-composited), color
 * transitions, and scale press feedback. Reduced-motion users get instant
 * transitions.
 */
const TABS: Record<
  UserRole,
  { href: string; label: string; icon: LucideIcon }[]
> = {
  student: [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/tutors", label: "Find tutors", icon: Compass },
    { href: "/chat", label: "Messages", icon: MessageCircle },
  ],
  tutor: [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/tutors", label: "Find tutors", icon: Compass },
    { href: "/chat", label: "Messages", icon: MessageCircle },
    { href: "/tutor", label: "My profile", icon: GraduationCap },
  ],
  admin: [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/admin", label: "Admin", icon: ShieldCheck },
  ],
};

export function MobileTabBar({ role }: { role?: UserRole }) {
  const pathname = usePathname();
  const tabs = role ? TABS[role] : [];
  if (tabs.length === 0) return null;

  const activeIndex = tabs.findIndex(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`),
  );
  const hasActive = activeIndex >= 0;
  const indicatorIndex = hasActive ? activeIndex : 0;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden [padding-bottom:env(safe-area-inset-bottom)]"
    >
      <div className="relative flex h-16">
        {/* Sliding accent line — width is one tab, translateX moves it by
            whole tabs (GPU-friendly transform, no layout thrash). */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0 top-0 h-0.5 rounded-full bg-brand-600 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
            !hasActive && "opacity-0",
          )}
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${indicatorIndex * 100}%)`,
          }}
        />

        {tabs.map((tab, i) => {
          const active = i === activeIndex;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              onClick={() => {
                // App convention: tapping the active tab scrolls back to top.
                if (pathname === tab.href) window.scrollTo({ top: 0 });
              }}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 pb-1.5 pt-2.5 transition duration-150 active:scale-[0.96] motion-reduce:transition-none",
                active
                  ? "text-brand-700"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <tab.icon
                className={cn(
                  "h-5 w-5",
                  active && "stroke-[2.2]",
                )}
              />
              <span className="text-[11px] font-semibold">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
