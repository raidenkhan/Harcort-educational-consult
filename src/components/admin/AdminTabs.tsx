"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarCheck, Wallet, LifeBuoy } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Admin-console tabs — same route-based pattern as the tutor hub: each tab
 * is a real URL that fetches only what it shows. Active state derives from
 * the pathname, so there's no client state to keep in sync.
 */
const TABS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/admin/payments", label: "Payments", icon: Wallet },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin console sections"
      className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-sm"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
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
            <Icon className="h-4 w-4" />
            {label}
            {label === "Support" && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                soon
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
