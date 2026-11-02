import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Container } from "@/components/ui/Container";
import { StudentTabs } from "@/components/student/StudentTabs";

/**
 * Student dashboard shell — one dashboard (`/dashboard`) with its sections
 * as routes: Home, Courses, Timetable, Payments, Settings. The old single
 * page was one endless scroll where a requests card, a course catalogue, a
 * timetable and a pile of settings cards all lived together; each page now
 * fetches only what it shows.
 *
 * The heading and tabs come from `StudentTabs`, which is pathname-aware, so
 * the page never disagrees with the tab row about which section you're on.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  // ONE dashboard per role. A tutor's is `/tutor`; this is the student
  // surface (admins share it for Home + Settings), so a tutor landing here
  // is sent to the real one instead of being shown a second dashboard.
  if (profile.role === "tutor") redirect("/tutor");

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-6 sm:py-12">
        <StudentTabs
          role={profile.role}
          firstName={profile.full_name.split(" ")[0]}
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

        {children}
      </Container>
    </div>
  );
}
