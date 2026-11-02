"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookOpen,
  CalendarClock,
  House,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { UserRole } from "@/types";

/**
 * Student workspace header + section tabs.
 *
 * ONE student dashboard lives at `/dashboard` and its sections are real
 * routes (`/dashboard/courses`, `/dashboard/timetable`, `/dashboard/payments`,
 * `/dashboard/settings`). It used to be one long page where a requests card,
 * a course catalogue, a timetable and four unrelated settings cards fought
 * for the same scroll — related content now has one home each, and each page
 * fetches only what it shows.
 *
 * Route-based like `TutorTabs`: the active state comes from the pathname, so
 * there is no client state to keep in sync. Admins only see Home + Settings —
 * the three student sections would render empty for them.
 */
type Section = {
  href: string;
  label: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  /** Courses/Timetable/Payments are student surfaces; an admin's dashboard
   *  is the admin console, so those tabs are hidden for them. */
  studentOnly?: boolean;
};

const TABS: Section[] = [
  {
    href: "/dashboard/courses",
    label: "Courses",
    title: "Courses for your program",
    description:
      "Your program and year, its courses, and the materials and tutors on each one.",
    icon: BookOpen,
    studentOnly: true,
  },
  {
    href: "/dashboard/timetable",
    label: "Timetable",
    title: "Timetable with your tutors",
    description:
      "Your tutor schedules sessions here. Tick attendance when you meet — it confirms the session happened on the admin side.",
    icon: CalendarClock,
    studentOnly: true,
  },
  {
    href: "/dashboard/payments",
    label: "Payments",
    title: "Payments",
    description:
      "Every agreement, what you've paid and what's left — pay the balance from here.",
    icon: Banknote,
    studentOnly: true,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    title: "Settings",
    description: "Your phone number, text alerts, program and account.",
    icon: Settings,
  },
];

export function StudentTabs({
  role,
  firstName,
  status,
}: {
  role: UserRole;
  /** First name for the Home greeting. */
  firstName: string;
  /** Extra line under the heading (the student's public code chip). */
  status?: React.ReactNode;
}) {
  const pathname = usePathname();

  const home: Section = {
    href: "/dashboard",
    label: "Home",
    title: `Welcome, ${firstName}.`,
    description:
      role === "admin"
        ? "Run the platform. Approve tutors, review reports."
        : "Find the right tutor for every course.",
    icon: House,
  };
  const tabs = role === "student" ? TABS : TABS.filter((t) => !t.studentOnly);
  const sections = [home, ...tabs];

  // The longest matching href wins, so `/dashboard/courses` never resolves
  // to the Home entry.
  const section =
    sections
      .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? home;

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
        aria-label="Dashboard sections"
        className="mt-8 flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-sm"
      >
        {sections.map(({ href, label, icon: Icon }) => {
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
