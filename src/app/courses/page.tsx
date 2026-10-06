import { Suspense } from "react";
import { listCourses } from "@/services/courses/queries";
import { getCurrentProfile } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { CourseCatalog } from "@/components/home/CourseCatalog";
import { LESSONS } from "@/components/home/HarcourtUniversity";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { PerspectiveGrid } from "@/components/ui/PerspectiveGrid";
import { AnimatedGradient } from "@/components/ui/AnimatedGradient";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { FloatingNav } from "@/components/navigation/FloatingNav";
import { GlobalSearchLoader } from "@/components/search/GlobalSearchLoader";

/**
 * /courses — the course catalog, one place where every program and course is
 * listed clearly (the board's "display available courses clearly" ask). Reuses
 * the landing's CourseCatalog picker so the browse experience is identical on
 * both pages: pick a program (Mechanical, Electrical, Computer, Maths…), see
 * its courses, jump to one. Data comes from the cached listCourses.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Courses",
  description:
    "Browse every KNUST engineering course on Harcourt — find your program, its courses, materials and the approved tutors who teach them.",
  alternates: { canonical: "/courses" },
};

export default async function CoursesPage() {
  const [courses, profile] = await Promise.all([
    listCourses(),
    getCurrentProfile(),
  ]);

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <FloatingNav
        links={[
          { href: "/", label: "Home" },
          { href: "/courses", label: "Courses" },
          { href: "/tutors", label: "Find a tutor" },
        ]}
      >
        {profile ? (
          <form action={signOutAction}>
            <button
              type="submit"
              className="h-10 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-xs transition duration-150 hover:border-slate-400 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        ) : (
          <>
            <AuthTrigger
              tab="sign-in"
              className="inline-flex h-9 rounded-full px-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 sm:h-10 sm:px-3.5 sm:text-sm"
            >
              Sign in
            </AuthTrigger>
            <AuthTrigger
              tab="sign-up"
              className="h-9 rounded-full bg-slate-900 px-3 text-[13px] font-semibold text-white shadow-xs hover:bg-slate-800 sm:h-10 sm:px-4 sm:text-sm"
            >
              <span className="sm:hidden">Sign up</span>
              <span className="hidden sm:inline">Get started</span>
            </AuthTrigger>
          </>
        )}
      </FloatingNav>

      <Suspense>
        <GlobalSearchLoader />
      </Suspense>

      <main className="relative flex-1">
        <section className="relative overflow-hidden">
          <AnimatedGradient size="90%" />
          <Container className="relative pb-16 pt-28">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-lilac-100/70">
                Courses
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Start from your course
              </h1>
              <p className="mt-3 text-lilac-100/90">
                Pick your program — Mechanical, Electrical &amp; Electronic,
                Computer Engineering, Maths and more — then jump to the course,
                its materials, and the tutors who teach it.
              </p>
            </div>
          </Container>
        </section>

        <section className="relative isolate -mt-6 rounded-t-[1.75rem] bg-canvas sm:rounded-t-[2.5rem]">
          <BentoBackdrop tone="purple" variant="smooth" className="-z-10" />
          <PerspectiveGrid tone="purple" className="-z-10" />
          <Container className="relative py-12 sm:py-16">
            {courses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-16 text-center">
                <p className="text-sm text-slate-500">
                  No courses published yet — check back soon.
                </p>
              </div>
            ) : (
              <CourseCatalog
                courses={courses.map((course) => ({
                  id: course.id,
                  subject: course.subject,
                  name: course.name,
                  description: course.description,
                  year: course.year,
                }))}
                lessons={LESSONS}
              />
            )}
          </Container>
        </section>
      </main>

      {profile && <MobileTabBar role={profile.role} />}

      <footer className="border-t border-slate-800 bg-slate-950">
        <Container className="flex flex-col items-center justify-between gap-4 py-8 text-sm text-lilac-200/80 sm:flex-row">
          <Logo dark />
          <p>
            © {new Date().getFullYear()} Harcourt Educational Consult · Kumasi,
            Ghana. All rights reserved.
          </p>
        </Container>
      </footer>
    </div>
  );
}
