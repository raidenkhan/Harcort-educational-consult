import Link from "next/link";
import {
  GraduationCap,
  BookOpenCheck,
  LifeBuoy,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { listApprovedTutors } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import { getCurrentProfile, profileIsAdmin } from "@/services/auth/queries";
import { ContactTutorButton } from "@/components/tutors/ContactTutorButton";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { AnimatedGradient } from "@/components/ui/AnimatedGradient";
import { Logo } from "@/components/ui/Logo";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { cn } from "@/lib/cn";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  YOUTUBE_URL,
  siteUrl,
} from "@/lib/site";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { FloatingNav } from "@/components/navigation/FloatingNav";
import { Reveal } from "@/components/home/Reveal";
import { Parallax } from "@/components/home/Parallax";
import { BounceDeck } from "@/components/home/BounceDeck";
import { HarcourtUniversity, LESSONS } from "@/components/home/HarcourtUniversity";
import FloatingLines from "@/components/home/FloatingLines";

/**
 * Public landing page — targets Ghanaian students, KNUST engineering first.
 * Shows approved tutors only (RLS enforced). Auth opens in a modal.
 *
 * Narrative (2026 repositioning): Harcourt is a learning platform built
 * around the real academic challenges students face — tutoring is one way it
 * delivers support, educational content (Harcourt University) is another.
 * The page leads with the student's problem, then shows what Harcourt does.
 */
export const dynamic = "force-dynamic";

/**
 * Verified free-lesson count from the Harcourt University YouTube channel.
 * Business-history figure — update by hand when the channel grows.
 */
const FREE_LESSONS_PUBLISHED = "30+";

/**
 * Structured data (schema.org JSON-LD) — tells search engines and AI
 * answer engines who Harcourt is, what the site is, and where else the
 * brand lives (YouTube). Rendered as a script tag at the top of the page.
 */
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "EducationalOrganization",
      "@id": siteUrl("/#organization"),
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      logo: siteUrl("/apple-icon.png"),
      address: {
        "@type": "PostalAddress",
        addressLocality: "Kumasi",
        addressCountry: "GH",
      },
      sameAs: [YOUTUBE_URL],
    },
    {
      "@type": "WebSite",
      "@id": siteUrl("/#website"),
      url: SITE_URL,
      name: SITE_NAME,
      publisher: { "@id": siteUrl("/#organization") },
      inLanguage: "en",
    },
  ],
};

/** Subjects currently taught in the Harcourt University lesson library —
 *  derived from the exported lesson list so the two never drift apart. */
const LESSON_SUBJECTS = Array.from(new Set(LESSONS.map((l) => l.topic)));

/* ── Letter-system primitives (landing-local) ─────────────────────
   The Letter style reference is deliberately shadowless: depth comes
   from surface contrast (white → mist → tinted walls → ink) and hairline
   borders, not elevation. The shared `Card` carries a shadow, so the
   landing uses its own flat card and section label instead. */

/** Flat card — hairline border, 2px radius, no shadow, no border radius
 *  growth on hover; the border darkens instead (Letter hover language). */
function FlatCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[2px] border border-slate-200 bg-white transition-colors duration-200 hover:border-slate-300",
        className,
      )}
    >
      {children}
    </div>
  );
}

export default async function Home() {
  const [tutors, courses, currentProfile] = await Promise.all([
    listApprovedTutors(),
    listCourses(),
    getCurrentProfile(),
  ]);

  const subjects = Array.from(new Set(courses.map((c) => c.subject)));

  const marqueeItems = [
    "Engineering Mathematics",
    "C Programming",
    "Circuit Theory",
    "Calculus",
    "Thermodynamics",
    "Data Structures",
    "Fluid Mechanics",
    "MATLAB",
    "Strength of Materials",
    "Digital Systems",
    "Control Systems",
    "Technical Report Writing",
  ];

  const pillars: {
    step: string;
    title: string;
    body: string;
    icon: LucideIcon;
  }[] = [
    {
      step: "01",
      title: "Tutoring",
      body: "Connect with approved tutors who know these exact courses — start a conversation, agree a time, and tick attendance when you meet.",
      icon: GraduationCap,
    },
    {
      step: "02",
      title: "Educational content",
      body: "Harcourt University publishes free, full-length lessons on YouTube — real problems worked step by step, not highlight reels.",
      icon: BookOpenCheck,
    },
    {
      step: "03",
      title: "Academic support",
      body: "Structured help around revision, exams and difficult coursework — arranged directly with tutors who teach your subjects.",
      icon: LifeBuoy,
    },
    {
      step: "04",
      title: "Practical learning",
      body: "Working models, graphical methods and analyses solved the way they're done on the board and in the lab.",
      icon: Wrench,
    },
  ];

  return (
    <div className="relative flex flex-1 flex-col">
      {/* Continuous page surface — the brand wash and blurred glows run under
          the whole page; the grid bands in the sections sit on top of it. */}
      <BentoBackdrop tone="purple" variant="smooth" className="-z-10" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <FloatingNav
        links={[
          { href: "/tutors", label: "Find a Tutor" },
          { href: "#subjects", label: "Subjects" },
          { href: "#learn", label: "Harcourt University" },
        ]}
      >
        {currentProfile ? (
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-full bg-slate-900 px-4 text-sm font-semibold text-white shadow-xs transition duration-150 hover:bg-slate-800 active:scale-[0.97]"
          >
            Dashboard
          </Link>
        ) : (
          <>
            <AuthTrigger
              tab="sign-in"
              className="inline-flex h-9 rounded-full px-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 sm:h-10 sm:px-3.5 sm:text-sm"
            >
              Sign in
            </AuthTrigger>
            <Link
              href="/tutors"
              className="h-9 rounded-full bg-slate-900 px-3 text-[13px] font-semibold leading-9 text-white shadow-xs hover:bg-slate-800 sm:h-10 sm:px-4 sm:text-sm sm:leading-10"
            >
              Find Academic Support
            </Link>
          </>
        )}
      </FloatingNav>

      {/* ── Hero (gradient backdrop) ───────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col justify-center supports-[height:100svh]:min-h-[100svh]">
        {/* The gradient fills its own clipping wrapper and simply stops at the
            section edge — no fade-down. See the sheet below for why. */}
        <div className="absolute inset-x-0 -top-28 -bottom-28 overflow-hidden">
          {/* TRIAL: FloatingLines runs the whole hero screen — full-bleed
              behind everything. The gradient sits on top as a soft wash and
              ink scrims keep the copy readable. One Parallax wrapper carries
              the entire stack, so the backdrop lags the scroll (parallax). */}
          <Parallax className="absolute inset-0" speed={0.16}>
            <FloatingLines
              linesGradient={[
                "#610b96",
                "#39065c",
                "#af88e3",
                "#b473da",
              ]}
              lineCount={[8, 12, 16]}
              lineDistance={[8, 6, 4]}
              animationSpeed={1}
              interactive
              bendRadius={5}
              bendStrength={-0.5}
              mixBlendMode="screen"
            />
            <div className="absolute inset-0 opacity-35">
              <AnimatedGradient />
            </div>
            <div className="absolute inset-0 bg-gradient-to-b from-petrol-950/55 via-transparent to-petrol-950/45" />
          </Parallax>
          {/* Readability scrim — pinned to the section, NOT inside the
              parallax stack, so the dim over the copy never shifts relative
              to the text while the waves drift behind it. Dark ink centre
              fades to transparent at the edges so the lines stay vivid. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 62% 58% at 50% 52%, rgba(21,10,32,0.62) 0%, rgba(21,10,32,0.28) 55%, transparent 78%)",
            }}
          />
        </div>
        <Container className="relative py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span
              className="inline-flex animate-fade-up items-center gap-2 rounded-[2px] bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-lilac-100 ring-1 ring-inset ring-white/20 backdrop-blur"
              style={{ animationDelay: "0ms" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Built for Ghanaian students · KNUST engineering first
            </span>
            <h1
              className="mt-6 animate-fade-up font-display text-4xl font-semibold leading-[1.08] tracking-[0.01em] text-white [text-shadow:0_2px_24px_rgba(21,10,32,0.75)] sm:text-6xl"
              style={{ animationDelay: "60ms" }}
            >
              When the course gets difficult,{" "}
              <span className="bg-gradient-to-r from-lilac-100 to-lilac-300 bg-clip-text text-transparent">
                get the right support
              </span>
              .
            </h1>
            <p
              className="mx-auto mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-lilac-100/90 [text-shadow:0_1px_12px_rgba(21,10,32,0.65)]"
              style={{ animationDelay: "120ms" }}
            >
              Harcourt is academic support built around the courses students
              actually struggle with. Get a tutor for one-on-one help — or
              learn free from Harcourt University, our lesson library on
              YouTube. Built for Ghanaian students, starting with KNUST
              engineering.
            </p>
            <div
              className="mt-10 flex animate-fade-up flex-wrap items-center justify-center gap-4"
              style={{ animationDelay: "180ms" }}
            >
              <Link
                href="/tutors"
                className="inline-flex h-12 items-center justify-center rounded-[2px] bg-white px-7 text-sm font-semibold text-petrol-900 transition duration-150 hover:bg-lilac-100 active:scale-[0.97]"
              >
                Find Academic Support
              </Link>
              <AuthTrigger
                tab="sign-up"
                className="h-12 rounded-[2px] border border-white/30 bg-white/10 px-7 text-sm font-semibold text-white backdrop-blur transition hover:border-white/50 hover:bg-white/20"
              >
                Become a Tutor
              </AuthTrigger>
            </div>
          </div>

          {/* Trust strip — live platform data + one verified business-history
              figure (the public YouTube lesson library). No invented numbers:
              the tutor count is exactly what the database says, even when it
              is zero. */}
          <div
            className="mx-auto mt-12 max-w-3xl animate-fade-up sm:mt-16"
            style={{ animationDelay: "260ms" }}
          >
            <dl className="grid grid-cols-3 divide-x divide-white/15 rounded-lg border border-white/15 bg-white/10 shadow-card backdrop-blur">
              {[
                { label: "Approved tutors", value: String(tutors.length) },
                { label: "Subjects covered", value: String(subjects.length) },
                {
                  label: "Free lessons published",
                  value: FREE_LESSONS_PUBLISHED,
                },
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-5 text-center sm:px-8">
                  <dt className="text-xs font-medium uppercase tracking-wide text-lilac-100/70">
                    {stat.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-bold text-white sm:text-3xl">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-center text-xs text-lilac-100/60">
              Live platform data — every listed tutor is admin-reviewed before
              going public.
            </p>
          </div>
        </Container>
      </section>

      {/* ── Subject marquee (the sheet's edge) ─────────────────────── */}
      {/* The marquee band is where the light page begins, so it carries the
          sheet edge: an opaque canvas surface with a rounded top pulled up
          over the hero. That seam is what reads cleanly — the long fade to
          canvas it replaces smeared the hero's dark violet into this band and
          made the boundary look muddy. It also puts the subject chips on solid
          canvas, so they stand out instead of dissolving into a gradient.
          Everything below shares the same canvas colour, so the page still
          reads as one surface. */}
      <section className="relative -mt-6 rounded-t-[1.75rem] bg-canvas py-8 sm:rounded-t-[2.5rem]">
        <Container>
          <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
              {marqueeItems.map((item, i) => (
                <span
                  key={`a-${i}`}
                  className="mx-3 flex shrink-0 items-center gap-2.5 rounded-[2px] border border-slate-300/70 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                >
                  {item}
                  <span className="text-brand-600">✦</span>
                </span>
              ))}
              {/* Duplicate half keeps the loop seamless; hidden from screen readers */}
              <div aria-hidden="true" className="flex">
                {marqueeItems.map((item, i) => (
                  <span
                    key={`b-${i}`}
                    className="mx-3 flex shrink-0 items-center gap-2.5 rounded-[2px] border border-slate-300/70 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    {item}
                    <span className="text-brand-600">✦</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* ── The problem (Paper White) ─────────────────────────────── */}
      {/* Letter rhythm: alternating white / mist surfaces create the
          gallery-walk pacing. The old PerspectiveGrid line bands fought the
          flat, shadowless language — surface contrast and hairlines carry
          depth now. */}
      <section id="problem" className="relative scroll-mt-24 border-t border-slate-200 bg-white">
        <Container className="py-20 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <Reveal>
              <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                The problem
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[0.01em] text-slate-900 sm:text-4xl">
                Some courses are difficult. Getting help shouldn&apos;t be.
              </h2>
            </Reveal>
            {/* Body copy gets the blur-focus variant — it reads as the
                section "coming into focus" after the headline lands. */}
            <Reveal variant="blur" delay={120}>
              <p className="mt-4 text-base leading-relaxed text-slate-600">
                You attend the lectures, read the notes, watch the videos — and
                still hit a wall when the worked examples stop making sense.
                That wall is normal. What shouldn&apos;t be normal is how hard
                it is to find structured help when it happens.
              </p>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                Harcourt exists to shorten the distance between being stuck and
                being understood — with tutors and lessons built around the
                courses that cause that wall in the first place.
              </p>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── What Harcourt actually does (Mist gallery wall) ────────── */}
      <section id="what" className="relative border-t border-slate-200 bg-slate-100">
        <Container className="py-20 sm:py-28">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                What Harcourt does
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[0.01em] text-slate-900 sm:text-4xl">
                One platform, more than one way to get help
              </h2>
            </div>
          </Reveal>
          {/* BounceDeck (React Bits' BounceCards, adapted for content): the
              cards elastic-bounce in when scrolled into view; on desktop
              they sit in a slight fan and hovering straightens one card
              while the others are pushed aside. Reduced motion: static. */}
          <BounceDeck className="mt-12">
            {pillars.map((item, i) => (
              <FlatCard
                key={item.step}
                className={cn(
                  // Letter tinted gallery walls — each pillar gets its own
                  // near-white tint; the tint IS the card's differentiator.
                  "flex h-full flex-col p-8",
                  i === 0 && "bg-[#fcede1]",
                  i === 1 && "bg-[#eefcef]",
                  i === 2 && "bg-[#e6def0]",
                )}
              >
                <span className="text-xs font-bold tabular-nums text-slate-400">
                  {item.step}
                </span>
                <span className="mt-5 flex h-11 w-11 items-center justify-center rounded-[2px] bg-white">
                  <item.icon className="h-5 w-5 text-petrol-900" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold tracking-[0.01em] text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </FlatCard>
            ))}
          </BounceDeck>
        </Container>
      </section>

      {/* ── Harcourt University (Paper White) ──────────────────────── */}
      <section className="relative border-t border-slate-200 bg-white">
        <HarcourtUniversity />
      </section>

      {/* ── Subjects (Mist gallery wall) ───────────────────────────── */}
      {/* Two honest sources, clearly labelled: what the free lesson library
          currently teaches, and what tutors are actually offering on the
          platform right now. */}
      <section id="subjects" className="relative scroll-mt-24 border-t border-slate-200 bg-slate-100">
        <Container className="py-20 sm:py-28">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-end">
            <Reveal variant="left">
              <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Subject coverage
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[0.01em] text-slate-900 sm:text-4xl">
                Two sources, one goal
              </h2>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <p className="max-w-sm text-sm leading-relaxed text-slate-600">
                The subjects our free lesson library teaches, and the subjects
                tutors on the platform are offering right now — each listed
                exactly as it exists today.
              </p>
            </Reveal>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <Reveal variant="up">
              <FlatCard className="h-full p-8">
                <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  From Harcourt University — free lessons
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  What the YouTube lesson library currently teaches.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {LESSON_SUBJECTS.map((subject) => (
                    <span
                      key={subject}
                      className="rounded-[2px] border border-petrol-100 bg-petrol-50 px-3 py-1.5 text-[13px] font-medium text-petrol-900"
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              </FlatCard>
            </Reveal>
            <Reveal variant="up" delay={80}>
              <FlatCard className="h-full p-8">
                <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  From tutors on the platform
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Subjects being taught right now by approved tutors.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {subjects.map((subject) => (
                    <span
                      key={subject}
                      className="rounded-[2px] border border-brand-100 bg-brand-50 px-3 py-1.5 text-[13px] font-medium text-brand-900"
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              </FlatCard>
            </Reveal>
          </div>
        </Container>
      </section>

      {/* ── Approved tutors (Paper White) ──────────────────────────── */}
      <section id="tutors" className="relative border-t border-slate-200 bg-white">
        <Container className="py-20 sm:py-28">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-end">
            <Reveal variant="left">
              <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                Find your tutor
              </p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-[0.01em] text-slate-900 sm:text-4xl">
                Reviewed, verified, ready
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
                Every profile below has passed our review process —
                qualifications checked, rates published, conversations
                started in one tap.
              </p>
            </Reveal>
            <Reveal variant="right" delay={100}>
              <AuthTrigger
                tab="sign-up"
                className="text-sm font-semibold text-slate-900 hover:text-slate-700"
              >
                Become a tutor →
              </AuthTrigger>
            </Reveal>
          </div>

          {tutors.length === 0 ? (
            <Reveal variant="blur">
              <div className="mt-12 rounded-[2px] border border-dashed border-slate-300 bg-slate-50/60 p-14 text-center">
                <p className="text-slate-600">
                  Our first tutor profiles are going through review right now.
                  In the meantime, start with a free lesson from{" "}
                  <a
                    href="https://www.youtube.com/@harcourt-university"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Harcourt University
                  </a>
                  .
                </p>
              </div>
            </Reveal>
          ) : (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {tutors.map(
                ({ tutorProfile, profile, services, courses }, i) => (
                <Reveal
                  key={tutorProfile.id}
                  variant="up"
                  delay={Math.min(i * 80, 320)}
                >
                <FlatCard className="flex h-full flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-petrol-900 text-sm font-bold text-white">
                      {(profile.full_name || "T").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-slate-900">
                          {profile.full_name || "Harcourt tutor"}
                        </span>
                        {profileIsAdmin(profile) && <VerifiedBadge />}
                      </p>
                      <p className="text-xs text-slate-500">
                        {tutorProfile.rate_per_hour != null
                          ? `GH₵${tutorProfile.rate_per_hour.toLocaleString()}/hr`
                          : "Rates on request"}
                      </p>
                    </div>
                  </div>

                  {tutorProfile.bio && (
                    <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-600">
                      {tutorProfile.bio}
                    </p>
                  )}

                  {services.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {courses.slice(0, 3).map((course) => (
                        <Badge key={course.id}>{course.name}</Badge>
                      ))}
                      {services.length > 3 && (
                        <Badge>+{services.length - 3} more</Badge>
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-6">
                    <ContactTutorButton
                      tutorProfileId={tutorProfile.id}
                      signedIn={Boolean(currentProfile)}
                      className="h-8 w-full rounded-[2px] bg-petrol-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-petrol-800"
                    />
                  </div>
                </FlatCard>
                </Reveal>
                ),
              )}
            </div>
          )}
        </Container>
      </section>

      {/* ── CTA band (Mist) ───────────────────────────────────────── */}
      {/* Letter: filled action carries the brand accent; the low-commitment
          alternative sits beside it as a ghost text link in the same colour. */}
      <section className="border-t border-slate-200 bg-slate-100">
        <Container className="flex flex-col items-center justify-between gap-8 py-20 text-center sm:flex-row sm:text-left">
          <Reveal variant="left">
            <h2 className="font-display text-2xl font-semibold tracking-[0.01em] text-slate-900 sm:text-3xl">
              Understand the course. Keep moving.
            </h2>
            <p className="mt-2 max-w-md leading-relaxed text-slate-600">
              Start with a free lesson, or get a tutor who has taken these
              courses before you — either way, the wall gets smaller.
            </p>
          </Reveal>
          <Reveal variant="right" delay={100} className="shrink-0">
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
            <Link
              href="/tutors"
              className="inline-flex h-12 items-center justify-center rounded-[2px] bg-brand-600 px-7 text-sm font-semibold text-white transition duration-150 hover:bg-brand-700 active:scale-[0.98]"
            >
              Find Academic Support
            </Link>
            <a
              href="#learn"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
            >
              Watch a free lesson
              <span aria-hidden="true">→</span>
            </a>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-petrol-800 bg-petrol-950">
        <Container className="flex flex-col items-center justify-between gap-4 py-8 text-sm text-lilac-200/80 sm:flex-row">
          <Logo dark />
          <a
            href="https://www.youtube.com/@harcourt-university"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition hover:text-white"
          >
            Harcourt University on YouTube
          </a>
          <p>
            © {new Date().getFullYear()} Harcourt Educational Consult · Kumasi,
            Ghana. All rights reserved.
          </p>
        </Container>
      </footer>
    </div>
  );
}
