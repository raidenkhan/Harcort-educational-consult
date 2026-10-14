import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarRange,
  ChevronRight,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  LIBRARY_PROGRAMS,
  countProgramCourses,
  countYearCourses,
  findLibraryProgram,
  findLibraryTerm,
  findLibraryYear,
  type LibraryFile,
  type LibraryProgram,
} from "@/services/library/driveLibrary";
import { getCurrentProfile } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { Badge } from "@/components/ui/Badge";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { PerspectiveGrid } from "@/components/ui/PerspectiveGrid";
import { AnimatedGradient } from "@/components/ui/AnimatedGradient";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { FloatingNav } from "@/components/navigation/FloatingNav";
import { GlobalSearchLoader } from "@/components/search/GlobalSearchLoader";
import { FolderCard } from "@/components/library/FolderCard";
import { ProgramDirectory } from "@/components/library/ProgramDirectory";

/**
 * /library — the study-material library, browsed like a folder tree that
 * mirrors the degree: programme → year → term → course folder.
 *
 * Programmes are the KNUST College of Engineering list; course folders are the
 * Mechanical Engineering Drive library (see
 * `services/library/driveLibrary.ts`), each opening its Drive folder in a new
 * tab. The whole tree lives on one route and drills down through
 * `?program=` / `?year=` / `?term=`, so a level is shareable and a breadcrumb
 * trails the path the student took.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Library",
  description:
    "Every KNUST engineering course, laid out by year and term. Pick your programme, choose your year and term, and open the course folder for its notes and tutorial videos.",
  alternates: { canonical: "/library" },
};

/** The four-level path, shown as a stepper in the hero. */
const STEPS: { icon: LucideIcon; label: string }[] = [
  { icon: GraduationCap, label: "Your programme" },
  { icon: CalendarRange, label: "Your year" },
  { icon: Layers, label: "Your term" },
  { icon: FileText, label: "The course folder" },
];

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; year?: string; term?: string }>;
}) {
  const {
    program: programParam,
    year: yearParam,
    term: termParam,
  } = await searchParams;
  const profile = await getCurrentProfile();

  const program = findLibraryProgram(programParam);
  const year = program ? findLibraryYear(program, yearParam) : null;
  const term = year ? findLibraryTerm(year, termParam) : null;

  // Four levels: programme list, a programme's years, a year's terms, or a
  // term's course folders. A year with no terms (the cross-year "Video links"
  // collection) skips straight to its documents.
  const level: "programmes" | "years" | "terms" | "courses" = !program
    ? "programmes"
    : !year
      ? "years"
      : term
        ? "courses"
        : year.terms.length > 0
          ? "terms"
          : "courses";
  const stepIndex =
    level === "programmes"
      ? 0
      : level === "years"
        ? 1
        : level === "terms"
          ? 2
          : 3;

  const heading =
    level === "programmes"
      ? "Pick your programme"
      : level === "years"
        ? `${program?.name} — pick your year`
        : level === "terms"
          ? `${year?.title} — pick a term`
          : `${term ? term.title : year?.title}`;

  const blurb =
    level === "programmes"
      ? "Every programme in the KNUST College of Engineering. Choose yours to open its course library."
      : level === "years"
        ? "Which year are you in? Open it to find your semester."
        : level === "terms"
          ? "Which semester are you in? Open it to see its courses."
          : "Open a course to jump straight to its folder of notes and tutorial videos.";

  const courses = term ? term.courses : [];
  const files = term ? term.files : year ? year.files : [];

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <FloatingNav
        links={[
          { href: "/", label: "Home" },
          { href: "/courses", label: "Courses" },
          { href: "/library", label: "Library" },
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
            <nav
              aria-label="Breadcrumb"
              className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-lilac-100/80"
            >
              <Link href="/" className="transition hover:text-white">
                Home
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-lilac-100/50" />
              {program ? (
                <>
                  <Link href="/library" className="transition hover:text-white">
                    Library
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 text-lilac-100/50" />
                  {year ? (
                    <>
                      <Link
                        href={`/library?program=${program.slug}`}
                        className="transition hover:text-white"
                      >
                        {program.name}
                      </Link>
                      <ChevronRight className="h-3.5 w-3.5 text-lilac-100/50" />
                      {term ? (
                        <>
                          <Link
                            href={`/library?program=${program.slug}&year=${year.slug}`}
                            className="transition hover:text-white"
                          >
                            {year.title}
                          </Link>
                          <ChevronRight className="h-3.5 w-3.5 text-lilac-100/50" />
                          <span className="text-white">{term.title}</span>
                        </>
                      ) : (
                        <span className="text-white">{year.title}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-white">{program.name}</span>
                  )}
                </>
              ) : (
                <span className="text-white">Library</span>
              )}
            </nav>

            <div className="mt-5 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-widest text-lilac-100/70">
                Library
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {heading}
              </h1>
              <p className="mt-3 text-lilac-100/90">{blurb}</p>
            </div>

            <ol className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li
                  key={step.label}
                  className={
                    index === stepIndex
                      ? "flex items-center gap-3 rounded-lg border border-white/40 bg-white/20 px-3.5 py-3 text-sm text-white backdrop-blur"
                      : "flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-3.5 py-3 text-sm text-lilac-100/80 backdrop-blur"
                  }
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/15 text-xs font-bold">
                    {index + 1}
                  </span>
                  <step.icon
                    className="h-4 w-4 shrink-0 text-lilac-200"
                    strokeWidth={1.75}
                  />
                  <span className="font-medium">{step.label}</span>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section className="relative isolate -mt-6 rounded-t-[1.75rem] bg-canvas sm:rounded-t-[2.5rem]">
          <BentoBackdrop tone="purple" variant="smooth" className="-z-10" />
          <PerspectiveGrid tone="purple" className="-z-10" />
          <Container className="relative space-y-12 py-12 sm:py-16">
            {level === "programmes" && (
              <ProgramDirectory
                programs={LIBRARY_PROGRAMS.map((entry) => ({
                  slug: entry.slug,
                  name: entry.name,
                  courseCount: countProgramCourses(entry),
                }))}
              />
            )}

            {level === "years" && program && (
              <YearGrid program={program} />
            )}

            {level === "terms" && program && year && (
              <TermGrid
                programSlug={program.slug}
                yearSlug={year.slug}
                terms={year.terms}
              />
            )}

            {level === "courses" && program && year && (
              <>
                <Link
                  href={
                    term
                      ? `/library?program=${program.slug}&year=${year.slug}`
                      : `/library?program=${program.slug}`
                  }
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {term ? "All terms" : "All years"}
                </Link>

                {courses.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                        {term ? `${term.driveName} courses` : `${year.title} courses`}
                      </h2>
                      <span className="text-sm text-slate-500">
                        {courses.length}{" "}
                        {courses.length === 1 ? "course" : "courses"}
                      </span>
                    </div>
                    <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {courses.map((course) => (
                        <FolderCard
                          key={course.url}
                          href={course.url}
                          external
                          title={course.name}
                          subtitle={course.code ?? null}
                          icon={BookOpen}
                          meta={
                            <ExternalLink
                              className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-500"
                              aria-hidden="true"
                            />
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {files.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
                        Video links
                      </h2>
                      <span className="text-sm text-slate-500">
                        {files.length}{" "}
                        {files.length === 1 ? "document" : "documents"}
                      </span>
                    </div>
                    <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                      {files.map((entry) => (
                        <li key={entry.url}>
                          <FileCard file={entry} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-sm leading-relaxed text-slate-500">
                  Folders open in Google Drive.{" "}
                  <a
                    href={year.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-brand-600 transition hover:text-brand-700"
                  >
                    Open the whole {year.title} folder
                  </a>
                  .
                </p>
              </>
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

/** Level 2: one folder per year, plus the cross-year video-links collection. */
function YearGrid({ program }: { program: LibraryProgram }) {
  if (program.years.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-card">
        <Badge tone="neutral">Coming soon</Badge>
        <h2 className="mt-4 font-display text-xl font-bold tracking-tight text-slate-900">
          {program.name} materials are on the way
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
          We&apos;re still packaging the notes and tutorial playlists for this
          programme. In the meantime, browse the Mechanical Engineering library
          or head to the course catalogue.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/library?program=mechanical-engineering"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Mechanical Engineering library
          </Link>
          <Link
            href="/courses"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
          >
            Course catalogue
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Browse {program.name} by year
        </h2>
        <span className="text-sm text-slate-500">Year 1 → 4</span>
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {program.years.map((entry) => {
          const isGuide = entry.terms.length === 0;
          const count = isGuide ? entry.files.length : countYearCourses(entry);
          return (
            <FolderCard
              key={entry.slug}
              href={`/library?program=${program.slug}&year=${entry.slug}`}
              title={entry.title}
              subtitle={entry.subtitle}
              icon={isGuide ? Video : GraduationCap}
              meta={
                <Badge tone="brand">
                  {count} {isGuide ? (count === 1 ? "file" : "files") : "courses"}
                </Badge>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/** Level 3: a year's terms. */
function TermGrid({
  programSlug,
  yearSlug,
  terms,
}: {
  programSlug: string;
  yearSlug: string;
  terms: { slug: string; title: string; courses: unknown[] }[];
}) {
  return (
    <div>
      <div className="max-w-2xl">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
          Step 3 of 4
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-[0.01em] text-slate-900">
          Choose a term
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Open the term you&apos;re studying to see its course folders.
        </p>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {terms.map((entry) => (
          <FolderCard
            key={entry.slug}
            href={`/library?program=${programSlug}&year=${yearSlug}&term=${entry.slug}`}
            title={entry.title}
            subtitle={`${entry.courses.length} ${
              entry.courses.length === 1 ? "course" : "courses"
            }`}
            icon={CalendarRange}
            meta={<Badge tone="brand">{entry.courses.length}</Badge>}
          />
        ))}
      </div>
    </div>
  );
}

/** A term (or the guide) video-links document as a link card. */
function FileCard({ file }: { file: LibraryFile }) {
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-petrol-50 text-petrol-900">
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-slate-900">
          {file.title}
        </span>
        <span className="mt-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
          Tutorial video playlist
        </span>
      </span>
      <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-brand-600" />
    </a>
  );
}
