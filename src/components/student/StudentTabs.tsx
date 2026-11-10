"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookOpen,
  CalendarClock,
  House,
  MessageCircle,
  Settings,
  Users,
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
 *
 * Two pieces: `StudentHeader` (the section's title + description, above
 * everything) and `StudentNav` (the menu — a sticky vertical sidebar from
 * `lg` up, a scrollable row below). The menu also carries Messages and Groups
 * (with the unread badge); for students those links left the top navbar, so
 * the dashboard menu is the one place to find them on desktop.
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

/** Links in the menu that lead out of the dashboard (no header of their own
 *  here — their pages have their own). */
const ELSEWHERE = [
  { href: "/chat", label: "Messages", icon: MessageCircle },
  { href: "/groups", label: "Groups", icon: Users },
] as const;

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

function useSections(role: UserRole, firstName: string) {
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

  // Longest matching href wins — `/dashboard` is a PREFIX of every section,
  // so plain prefix matching would keep Home lit on every other tab.
  const matched = sections
    .filter((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))
    .sort((a, b) => b.href.length - a.href.length);
  const section = matched[0] ?? home;
  return { sections, section, activeHref: section.href };
}

/** The current section's heading — sits above the sidebar and content. */
export function StudentHeader({
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
  const { section } = useSections(role, firstName);
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
    </div>
  );
}

const linkClass = (active: boolean) =>
  cn(
    "flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-150 lg:py-2.5",
    active
      ? "bg-brand-600 text-white shadow-sm"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  );

/** The dashboard menu: sidebar on desktop, scrollable row on phones. */
export function StudentNav({
  role,
  firstName,
  groupUnread = 0,
}: {
  role: UserRole;
  firstName: string;
  /** Unread study-group messages (0036) — the badge that used to sit on the
   *  navbar's Groups link. */
  groupUnread?: number;
}) {
  const { sections, activeHref } = useSections(role, firstName);
  const showElsewhere = role === "student";

  return (
    <nav
      aria-label="Dashboard sections"
      className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200/80 bg-white/80 p-1.5 backdrop-blur-sm lg:flex-col lg:overflow-visible"
    >
      {sections.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={linkClass(active)}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}

      {showElsewhere && (
        <>
          {/* A hairline between the dashboard's own sections and the links
              that lead to Messages / Groups (vertical layout only). */}
          <span aria-hidden="true" className="mx-2 hidden h-px bg-slate-200 lg:my-1 lg:block" />
          {ELSEWHERE.map(({ href, label, icon: Icon }) => {
            const badge = href === "/groups" ? groupUnread : 0;
            return (
              <Link
                key={href}
                href={href}
                aria-label={badge ? `${label}, ${badge} unread` : undefined}
                className={linkClass(false)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                {badge > 0 && (
                  <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </>
      )}
    </nav>
  );
}
