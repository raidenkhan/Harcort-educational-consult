import Image from "next/image";
import Link from "next/link";
import { Search, ShieldCheck, MessagesSquare, type LucideIcon } from "lucide-react";
import { listApprovedTutors } from "@/services/tutors/queries";
import { listCourses } from "@/services/courses/queries";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Logo } from "@/components/ui/Logo";
import { AuthTrigger } from "@/components/auth/AuthTrigger";

/**
 * Public landing page — targets Ghanaian students, KNUST engineering first.
 * Shows approved tutors only (RLS enforced). Auth opens in a modal.
 */
export const dynamic = "force-dynamic";

export default async function Home() {
  const [tutors, courses] = await Promise.all([
    listApprovedTutors(),
    listCourses(),
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

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Top navigation ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <Link href="#how" className="transition hover:text-slate-900">
              How it works
            </Link>
            <Link href="#subjects" className="transition hover:text-slate-900">
              Subjects
            </Link>
            <Link href="#tutors" className="transition hover:text-slate-900">
              Find a tutor
            </Link>
          </nav>
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

      {/* ── Hero (gradient backdrop) ───────────────────────────────── */}
      <section className="relative overflow-hidden">
        <Image
          src="/gradback.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-white/25" />
        <Container className="relative py-24 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span
              className="inline-flex animate-fade-up items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200/70 backdrop-blur"
              style={{ animationDelay: "0ms" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Built for Ghanaian students · KNUST engineering first
            </span>
            <h1
              className="mt-6 animate-fade-up font-display text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-6xl"
              style={{ animationDelay: "60ms" }}
            >
              The right tutor for{" "}
              <span className="bg-gradient-to-r from-brand-600 to-petrol-700 bg-clip-text text-transparent">
                every course
              </span>
              .
            </h1>
            <p
              className="mx-auto mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-slate-700"
              style={{ animationDelay: "120ms" }}
            >
              Harcot connects students with approved, qualified tutors for the
              courses they need. Built for Ghanaian students — starting with
              KNUST engineering — with clear pricing and a conversation that
              starts the moment you&apos;re ready.
            </p>
            <div
              className="mt-10 flex animate-fade-up flex-wrap items-center justify-center gap-4"
              style={{ animationDelay: "180ms" }}
            >
              <AuthTrigger
                tab="sign-up"
                className="h-12 rounded-md bg-slate-900 px-7 text-sm font-semibold text-white shadow-lift hover:bg-slate-800"
              >
                Find a tutor
              </AuthTrigger>
              <AuthTrigger
                tab="sign-up"
                className="h-12 rounded-md border border-slate-300 bg-white px-7 text-sm font-semibold text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50"
              >
                Become a tutor
              </AuthTrigger>
            </div>
          </div>

          {/* Trust bar */}
          <dl
            className="mx-auto mt-16 grid max-w-3xl animate-fade-up grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white/80 shadow-card backdrop-blur"
            style={{ animationDelay: "260ms" }}
          >
            {[
              { label: "Approved tutors", value: String(tutors.length) },
              { label: "Subjects covered", value: String(subjects.length) },
              { label: "Profiles verified", value: "100%" },
            ].map((stat) => (
              <div key={stat.label} className="px-4 py-5 text-center sm:px-8">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* ── Subject marquee ────────────────────────────────────────── */}
      <section className="border-y border-slate-200 bg-white py-5">
        <Container>
          <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
            <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
              {marqueeItems.map((item, i) => (
                <span
                  key={`a-${i}`}
                  className="mx-3 flex shrink-0 items-center gap-2.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs"
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
                    className="mx-3 flex shrink-0 items-center gap-2.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs"
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

      {/* ── How it works ───────────────────────────────────────────── */}
      <section id="how" className="bg-white">
        <Container className="py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
              How Harcot works
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              A trusted path from student to tutor
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {(
              [
                {
                  step: "01",
                  title: "Students find tutors",
                  body: "Browse approved tutors by subject and course, compare rates, and pick who fits your goals.",
                  icon: Search,
                },
                {
                  step: "02",
                  title: "Tutors get verified",
                  body: "Tutors advertise the courses they teach. Our team reviews and approves every profile before it goes live.",
                  icon: ShieldCheck,
                },
                {
                  step: "03",
                  title: "Learning happens",
                  body: "Message your tutor directly and schedule guidance that moves at your pace.",
                  icon: MessagesSquare,
                },
              ] as { step: string; title: string; body: string; icon: LucideIcon }[]
            ).map((item) => (
              <Card key={item.step} hover className="relative pt-10">
                <span className="absolute left-6 top-6 text-xs font-bold text-slate-300">
                  {item.step}
                </span>
                <span className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-100">
                  <item.icon className="h-5 w-5 text-slate-700" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {item.body}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Subjects ───────────────────────────────────────────────── */}
      <section id="subjects" className="border-y border-slate-200 bg-canvas">
        <Container className="py-20">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                Subject coverage
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900">
                {subjects.length} subjects and counting
              </h2>
            </div>
            <p className="max-w-sm text-sm text-slate-600">
              Starting with KNUST engineering — mathematics, programming,
              circuits, mechanics and more, with new subjects on the way.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            {subjects.map((subject) => (
              <span
                key={subject}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-xs transition hover:border-slate-300 hover:text-slate-900"
              >
                {subject}
              </span>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Approved tutors ────────────────────────────────────────── */}
      <section id="tutors" className="bg-white">
        <Container className="py-20">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                Approved tutors
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-slate-900">
                Reviewed, verified, ready
              </h2>
              <p className="mt-2 max-w-lg text-sm text-slate-600">
                Every profile below has passed our review process.
              </p>
            </div>
            <AuthTrigger
              tab="sign-up"
              className="text-sm font-semibold text-slate-900 hover:text-slate-700"
            >
              Become a tutor →
            </AuthTrigger>
          </div>

          {tutors.length === 0 ? (
            <div className="mt-10 rounded-lg border border-dashed border-slate-300 bg-canvas p-14 text-center">
              <p className="text-slate-600">
                No tutors yet — be the first to{" "}
                <AuthTrigger
                  tab="sign-up"
                  className="font-semibold text-slate-900 hover:text-slate-700"
                >
                  sign up
                </AuthTrigger>
                .
              </p>
            </div>
          ) : (
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {tutors.map(({ tutorProfile, profile, services, courses }) => (
                <Card key={tutorProfile.id} hover className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-slate-900 text-sm font-bold text-white">
                      {(profile.full_name || "T").charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {profile.full_name || "Harcot tutor"}
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
                    <AuthTrigger
                      tab="sign-up"
                      className="h-8 w-full rounded-md bg-slate-900 px-3 text-xs font-semibold text-white shadow-xs hover:bg-slate-800"
                    >
                      Contact tutor
                    </AuthTrigger>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* ── CTA band ───────────────────────────────────────────────── */}
      <section className="border-t border-slate-200 bg-white">
        <Container className="flex flex-col items-center justify-between gap-8 py-16 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Ready to learn without limits?
            </h2>
            <p className="mt-2 max-w-md text-slate-600">
              Join Harcot today — free to start, built to grow with you.
            </p>
          </div>
          <AuthTrigger
            tab="sign-up"
            className="h-12 shrink-0 rounded-md bg-slate-900 px-8 text-sm font-semibold text-white shadow-lift hover:bg-slate-800"
          >
            Create your free account
          </AuthTrigger>
        </Container>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
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
