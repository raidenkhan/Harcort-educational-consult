"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  Compass,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserRole } from "@/types";

/**
 * App-like bottom tab bar for mobile (hidden on lg+ where the top nav takes
 * over). Role-aware: students get Home / Find tutors / Messages / Timetable;
 * a tutor's Home is their `/tutor` dashboard; admins get Home / Admin.
 *
 * Motion follows the frequency gate: tab switching is a "tens of times per
 * day" interaction, so everything stays fast and subtle — a 200ms ease-out
 * sliding accent line (transform/opacity only, GPU-composited), color
 * transitions, and scale press feedback. Reduced-motion users get instant
 * transitions.
 */
type Tab = { href: string; label: string; icon: LucideIcon };

const TABS: Record<UserRole, Tab[]> = {
  student: [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/tutors", label: "Find tutors", icon: Compass },
    // Students' messages and groups live inside the dashboard (sidebar).
    { href: "/dashboard/messages", label: "Messages", icon: MessageCircle },
    { href: "/dashboard/groups", label: "Groups", icon: Users },
    // A real route since the dashboard was split into tabs — the timetable
    // has its own page, not an anchor on one endless scroll.
    { href: "/dashboard/timetable", label: "Timetable", icon: CalendarClock },
  ],
  tutor: [
    // One dashboard per role: a tutor's is `/tutor`, so the Home tab and a
    // separate "Tutor hub" tab would be the same destination twice.
    { href: "/tutor", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tutors", label: "Find tutors", icon: Compass },
    { href: "/chat", label: "Messages", icon: MessageCircle },
    { href: "/groups", label: "Groups", icon: Users },
  ],
  // An admin's one dashboard is the console; Messages because admins chat
  // with students and tutors from /chat.
  admin: [
    { href: "/admin", label: "Console", icon: LayoutDashboard },
    { href: "/chat", label: "Messages", icon: MessageCircle },
  ],
};

export function MobileTabBar({
  role,
  isAdmin = false,
  groupUnread = 0,
}: {
  role?: UserRole;
  /** Admin privilege flag (0008) — admin-tutors get an extra Admin tab. */
  isAdmin?: boolean;
  /** Unread study-group messages (0036) — pill on the Groups tab. */
  groupUnread?: number;
}) {
  const pathname = usePathname();
  const base = role ? TABS[role] : [];
  // A tutor who is also an admin gets the Admin tab on top of their tutor tabs
  // (role === "admin" already has it in TABS.admin).
  const tabs =
    isAdmin && role && role !== "admin"
      ? [...base, { href: "/admin", label: "Admin", icon: ShieldCheck }]
      : base;
  if (tabs.length === 0) return null;

  // Active-tab detection: longest matching href wins, so Timetable beats
  // Home on `/dashboard/timetable` (Home is a prefix of it), while
  // `/dashboard/courses` still lights Home — it has no mobile tab of its own.
  const matched = tabs
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length);
  const activeIndex = matched.length > 0 ? tabs.indexOf(matched[0]) : -1;
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
          const badge =
            tab.href === "/groups" || tab.href === "/dashboard/groups" ? groupUnread : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              aria-label={
                badge > 0
                  ? `${tab.label}, ${badge} unread`
                  : undefined
              }
              onClick={() => {
                // App convention: tapping the active tab scrolls back to top.
                if (active) window.scrollTo({ top: 0 });
              }}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 pb-1.5 pt-2.5 transition duration-150 active:scale-[0.96] motion-reduce:transition-none",
                active
                  ? "text-brand-700"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <span className="relative">
                <tab.icon
                  className={cn(
                    "h-5 w-5",
                    active && "stroke-[2.2]",
                  )}
                />
                {badge > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-semibold">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
