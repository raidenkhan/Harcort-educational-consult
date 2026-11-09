"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  LibraryBig,
  Wallet,
  TrendingUp,
  Users,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Admin-console tabs — same route-based pattern as the tutor hub: each tab
 * is a real URL that fetches only what it shows. Active state derives from
 * the pathname, so there's no client state to keep in sync.
 *
 *   Overview → numbers only (people, money, student payments)
 *   People   → tutor applications, password resets, reports
 *   Courses  → tutor-added courses to approve + the course library
 *   Sessions → attendance tracker (route stays /admin/attendance)
 *   Payments → sub-tabs: payouts, plan requests, agreements, links, log
 *   Insights → sub-tabs: performance (/admin/analytics), texts (/admin/sms)
 *   Settings → the admin's own phone/SMS + account
 */
const TABS: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Other route prefixes that belong to this tab. */
  also?: string[];
}[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/people", label: "People", icon: Users },
  { href: "/admin/courses", label: "Courses", icon: LibraryBig },
  { href: "/admin/attendance", label: "Sessions", icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments", icon: Wallet },
  { href: "/admin/analytics", label: "Insights", icon: TrendingUp, also: ["/admin/sms"] },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string, also: string[] = []) {
  if (href === "/admin") return pathname === "/admin";
  return [href, ...also].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin console sections"
      className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-sm"
    >
      {TABS.map(({ href, label, icon: Icon, also }) => {
        const active = isActive(pathname, href, also);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150",
              active
                ? "bg-petrol-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
