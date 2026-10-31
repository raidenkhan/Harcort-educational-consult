"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Tutor workspace header + section tabs.
 *
 * There is ONE tutor dashboard and it lives at `/tutor`: the app header's
 * "Dashboard" link points here, and this row switches between the sections
 * that make it up. It used to be a second "Dashboard" tab inside a "Tutor hub"
 * nav item, so a tutor saw two dashboards in the same header — the home entry
 * now names the page and the tabs only carry the sections, which is why
 * "Dashboard" is not a tab.
 *
 * Route-based: each tab is a real URL that only fetches what it shows (the old
 * single-page hub fetched everything at once and read as one endless scroll).
 * Active state comes from the pathname, so there is no client state to keep in
 * sync. Settings sits last on purpose: it is a utility surface, not a place a
 * tutor works from every day.
 */
type Section = {
  href: string;
  label: string;
  title: string;
  description?: string;
  icon: LucideIcon;
};

const HOME: Section = {
  href: "/tutor",
  label: "Dashboard",
  title: "Dashboard",
  description:
    "Your students, your lessons and your money — in one place.",
  icon: LayoutDashboard,
};

const TABS: Section[] = [
  { href: "/tutor/timetable", label: "Timetable", title: "Timetable", icon: CalendarDays },
  { href: "/tutor/students", label: "Students", title: "Students", icon: Users },
  { href: "/tutor/earnings", label: "Earnings", title: "Earnings", icon: Wallet },
  { href: "/tutor/settings", label: "Settings", title: "Settings",
    description: "How students see you, the courses you offer, and how we reach you.",
    icon: Settings },
];

const SECTIONS = [HOME, ...TABS];

export function TutorTabs({ status }: { status?: React.ReactNode }) {
  const pathname = usePathname();

  // The longest matching href wins, so `/tutor/settings` never resolves to the
  // dashboard entry and a nested route still resolves to its section.
  const section =
    SECTIONS.filter(
      (s) => pathname === s.href || pathname.startsWith(`${s.href}/`),
    ).sort((a, b) => b.href.length - a.href.length)[0] ?? HOME;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-slate-900 sm:text-3xl">
        {section.title}
      </h1>
      {section.description && (
        <p className="mt-2 max-w-xl text-sm text-slate-600 sm:text-base">
          {section.description}
        </p>
      )}
      {status}

      <nav
        aria-label="Tutor dashboard sections"
        className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-sm"
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
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
    </div>
  );
}
