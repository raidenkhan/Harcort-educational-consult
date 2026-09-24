"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Tutor-hub tabs — route-based, so each tab is a real URL that only fetches
 * what it shows (the old single-page dashboard fetched everything at once
 * and read as one endless scroll). Active state comes from the pathname, so
 * no client state to keep in sync.
 */
const TABS = [
  { href: "/tutor", label: "Overview", icon: LayoutDashboard },
  { href: "/tutor/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/tutor/students", label: "Students", icon: Users },
  { href: "/tutor/earnings", label: "Earnings", icon: Wallet },
];

export function TutorTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Tutor hub sections"
      className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-sm"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/tutor" ? pathname === "/tutor" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
