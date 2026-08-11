import Link from "next/link";
import { Users } from "lucide-react";
import { listApprovedTutors } from "@/services/tutors/queries";
import { getCurrentProfile } from "@/services/auth/queries";
import { TutorExplorer } from "@/components/tutors/TutorExplorer";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";

/**
 * Public tutor directory — browse approved tutors with search + subject
 * filters. Open to everyone (contacting still gates on sign-in via the
 * session-aware ContactTutorButton). Data comes from the same cached
 * listApprovedTutors as the home page.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find a tutor",
  description:
    "Browse verified tutors for KNUST engineering and beyond — search by subject, course, or qualification, compare rates, and reach out.",
};

export default async function TutorsPage() {
  const [tutors, profile] = await Promise.all([
    listApprovedTutors(),
    getCurrentProfile(),
  ]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <BentoBackdrop tone="amber" />

      {/* ── Top navigation ───────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
              <Link href="/" className="transition hover:text-slate-900">
                Home
              </Link>
              <span className="font-semibold text-slate-900">Find a tutor</span>
            </nav>
          </div>
          <div className="flex items-center gap-2.5">
            <AuthTrigger
              tab="sign-in"
              className="h-10 rounded-md px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Sign in
            </AuthTrigger>
            <AuthTrigger
              tab="sign-up"
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-xs hover:bg-slate-800"
            >
              Get started
            </AuthTrigger>
          </div>
        </Container>
      </header>

      {/* ── Directory ────────────────────────────────────────────── */}
      <main className="relative flex-1">
        <Container className="py-14">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
              Find a tutor
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Browse verified tutors
            </h1>
            <p className="mt-3 text-slate-600">
              Every profile below has passed our review process. Search by
              subject or course, check credentials and rates, then reach out.
            </p>
          </div>

          {tutors.length === 0 ? (
            <div className="mt-10 rounded-lg border border-dashed border-slate-300 bg-white/70 p-16 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm text-slate-500">
                No tutors yet — be the first to sign up as a tutor.
              </p>
              <AuthTrigger
                tab="sign-up"
                className="mt-4 text-sm font-semibold text-slate-900 hover:text-slate-700"
              >
                Become a tutor →
              </AuthTrigger>
            </div>
          ) : (
            <TutorExplorer tutors={tutors} signedIn={Boolean(profile)} />
          )}
        </Container>
      </main>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950">
        <Container className="flex flex-col items-center justify-between gap-4 py-8 text-sm text-slate-500 sm:flex-row">
          <Logo dark />
          <p>
            © {new Date().getFullYear()} Harcot Educational Consult · Kumasi,
            Ghana. All rights reserved.
          </p>
        </Container>
      </footer>
    </div>
  );
}
