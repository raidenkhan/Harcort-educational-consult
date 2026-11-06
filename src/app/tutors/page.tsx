import { Users } from "lucide-react";
import { safeListApprovedTutors } from "@/services/tutors/queries";
import { SITE_NAME } from "@/lib/site";
import { serializeJsonLd } from "@/lib/jsonLd";
import { getCurrentProfile } from "@/services/auth/queries";
import { TutorExplorer } from "@/components/tutors/TutorExplorer";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { PerspectiveGrid } from "@/components/ui/PerspectiveGrid";
import { AnimatedGradient } from "@/components/ui/AnimatedGradient";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { PublicNav } from "@/components/navigation/PublicNav";

/**
 * Public tutor directory — browse approved tutors with search + subject
 * filters. Open to everyone (contacting still gates on sign-in via the
 * session-aware ContactTutorButton). Data comes from the same cached
 * listApprovedTutors as the home page.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Find a tutor",
  alternates: { canonical: "/tutors" },
  description:
    "Browse verified tutors for KNUST engineering and beyond — search by subject, course, or qualification, compare rates, and reach out.",
};

export default async function TutorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [tutors, profile, { q }] = await Promise.all([
    safeListApprovedTutors(),
    getCurrentProfile(),
    searchParams,
  ]);

  /** ItemList of the currently-approved tutors — helps search engines and
      AI answer engines understand the directory's live contents. */
  const tutorJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Approved tutors — ${SITE_NAME}`,
    numberOfItems: tutors.length,
    itemListOrder: "https://schema.org/ItemListOrderDescending",
    itemListElement: tutors.map(({ tutorProfile, profile }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Person",
        name: profile.full_name || "Harcourt tutor",
        jobTitle: "Tutor",
        description: tutorProfile.bio ?? undefined,
      },
    })),
  };

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(tutorJsonLd) }}
      />
      <PublicNav profile={profile} />

      {/* ── Directory ────────────────────────────────────────────── */}
      <main className="relative flex-1">
        <section className="relative overflow-hidden">
          <AnimatedGradient size="90%" />
          <Container className="relative pb-16 pt-28">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-lilac-100/70">
                Find a tutor
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Browse verified tutors
              </h1>
              <p className="mt-3 text-lilac-100/90">
                Every profile below has passed our review process. Search by
                subject or course, check credentials and rates, then reach out.
              </p>
            </div>
          </Container>
        </section>

        {/* The directory rises over the hero as a rounded opaque sheet — the
            same seam as the landing page — and runs on the perspective grid
            horizon. `isolate` gives the sheet its own stacking context so the
            backdrop and the grid band (-z-10) paint above the sheet's own
            background instead of being hidden behind it. */}
        <section className="relative isolate -mt-6 rounded-t-[1.75rem] bg-canvas sm:rounded-t-[2.5rem]">
          <BentoBackdrop tone="purple" variant="smooth" className="-z-10" />
          <PerspectiveGrid tone="purple" className="-z-10" />
          <Container className="relative py-10">
            {tutors.length === 0 ? (
              <div className="mt-10 rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center sm:p-16">
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
              <TutorExplorer
                tutors={tutors}
                signedIn={Boolean(profile)}
                initialQuery={q ?? ""}
              />
            )}
          </Container>
        </section>
      </main>

      {/* Mobile tab bar keeps the app feel when browsing the directory. */}
      {profile && <MobileTabBar role={profile.role} />}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950">
        <Container className="flex flex-col items-center justify-between gap-4 pb-24 pt-8 text-sm text-lilac-200/80 sm:flex-row lg:pb-8">
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
