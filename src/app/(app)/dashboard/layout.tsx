import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Container } from "@/components/ui/Container";
import { StudentHeader, StudentNav } from "@/components/student/StudentTabs";
import { countUnreadGroupMessages } from "@/services/groups/queries";
import { listNotificationsFor } from "@/services/notifications/store";

/**
 * Student dashboard shell — one dashboard (`/dashboard`) with its sections
 * as routes: Home, Courses, Timetable, Payments, Settings. The old single
 * page was one endless scroll where a requests card, a course catalogue, a
 * timetable and a pile of settings cards all lived together; each page now
 * fetches only what it shows.
 *
 * The heading and menu come from `StudentHeader` / `StudentNav`, which are
 * pathname-aware, so
 * the page never disagrees with the tab row about which section you're on.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // ONE dashboard per role. A tutor's is `/tutor` and an admin's is the
  // console at `/admin` (its Settings tab holds their account settings); this
  // is the student surface, so anyone else landing here is sent to theirs.
  // A student or tutor with the is_admin FLAG keeps their own dashboard and
  // reaches the console from the avatar menu.
  if (profile.role === "tutor") redirect("/tutor");
  if (profile.role === "admin") redirect("/admin");

  const firstName = profile.full_name.split(" ")[0];
  // Sidebar badges: unread group messages (0036) and unread notifications
  // (0042, null when the table doesn't exist yet → no badge).
  const [groupUnread, notifications] =
    profile.role === "student"
      ? await Promise.all([
          countUnreadGroupMessages(profile),
          listNotificationsFor(profile.id, 1),
        ])
      : [0, null];

  return (
    // `overflow-clip`, not `overflow-hidden`: hidden makes this wrapper a
    // scroll container, which silently breaks the sidebar's `sticky`.
    <div className="relative overflow-clip">
      <BentoBackdrop tone="petrol" />
      <Container className="py-6 sm:py-12">
        <StudentHeader
          role={profile.role}
          firstName={firstName}
          status={
            profile.public_code ? (
              <p
                className="mt-4 inline-block rounded-md border border-slate-200 bg-white/70 px-3 py-1.5 font-mono text-xs tracking-wide tabular-nums text-slate-500"
                title="Your Harcourt tracking code — quote it whenever you contact support or an admin about payments"
              >
                {profile.public_code}
              </p>
            ) : null
          }
        />

        {/* Sidebar from lg up (sticky); a scrollable row above the content
            below lg. Each page's own top margin is zeroed so content lines
            up with the top of the sidebar. */}
        <div className="mt-8 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <aside className="lg:sticky lg:top-24">
            <StudentNav
              role={profile.role}
              firstName={firstName}
              badges={{
                "/dashboard/groups": groupUnread,
                "/dashboard/notifications": notifications?.unread ?? 0,
              }}
            />
          </aside>
          <div className="mt-8 min-w-0 lg:mt-0 [&>*:first-child]:mt-0">{children}</div>
        </div>
      </Container>
    </div>
  );
}
