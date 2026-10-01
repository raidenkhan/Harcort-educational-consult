import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Users,
  Video,
} from "lucide-react";
import {
  getCourseById,
  listCourseMaterials,
  listCourseVideos,
  listTutorsForCourse,
} from "@/services/courses/queries";
import { getCurrentProfile, profileIsAdmin } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { CourseMaterial } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { AnimatedGradient } from "@/components/ui/AnimatedGradient";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { PerspectiveGrid } from "@/components/ui/PerspectiveGrid";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { FloatingNav } from "@/components/navigation/FloatingNav";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { ContactTutorButton } from "@/components/tutors/ContactTutorButton";
import { CourseVideoGrid } from "@/components/courses/CourseVideoGrid";
import { RelatedLessons } from "@/components/courses/RelatedLessons";
import { groupBySemester, hasSemesterGrouping } from "@/services/courses/semesters";

/**
 * Public course page — one course's home for materials and tutorial videos,
 * plus the tutors who teach it.
 *
 * This is where the landing page's "Browse by course" band sends students.
 * Everything is read through the service layer (service-role client, scoped
 * in the query), never from the browser.
 *
 * The page stays honest: sections with no content yet say so and point at
 * the next useful thing (the lesson library, or a tutor) instead of showing
 * a fake or empty grid.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourseById(id);

  if (!course) {
    return { title: "Course not found", robots: { index: false } };
  }

  return {
    title: `${course.name} — ${course.subject}`,
    description:
      course.description ??
      `Course materials, tutorial videos and approved tutors for ${course.name} (${course.subject}).`,
    alternates: { canonical: `/courses/${course.id}` },
  };
}

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [course, profile] = await Promise.all([getCourseById(id), getCurrentProfile()]);
  if (!course) notFound();

  const [materials, videos, tutors] = await Promise.all([
    listCourseMaterials(course.id),
    listCourseVideos(course.id),
    listTutorsForCourse(course.id),
  ]);

  // Per-term headings only appear once something actually carries a term:
  // before that, a flat list is the honest rendering and an "Unassigned"
  // heading over every row would just be noise (0018).
  const showSemesters = hasSemesterGrouping([...videos, ...materials]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: course.name,
    description: course.description ?? undefined,
    url: `${SITE_URL}/courses/${course.id}`,
    about: course.subject,
    provider: {
      "@type": "EducationalOrganization",
      name: SITE_NAME,
      url: SITE_URL,
    },
  };

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FloatingNav
        links={[
          { href: "/", label: "Home" },
          { href: "/#courses", label: "Courses" },
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

      <main className="relative flex-1">
        {/* ── Course header ─────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <AnimatedGradient size="90%" />
          <Container className="relative pb-16 pt-28">
            <Link
              href="/#courses"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-lilac-100/80 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
              All courses
            </Link>
            <div className="mt-5 max-w-3xl">
              <span className="inline-flex items-center rounded-md bg-white/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-widest text-lilac-100 ring-1 ring-inset ring-white/20 backdrop-blur">
                {course.subject}
              </span>
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {course.name}
              </h1>
              {course.description && (
                <p className="mt-3 text-lilac-100/90">{course.description}</p>
              )}
              <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm text-lilac-100/80">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-lilac-200/70" strokeWidth={1.5} />
                  <dt className="sr-only">Tutorial videos</dt>
                  <dd>
                    {videos.length}{" "}
                    {videos.length === 1 ? "tutorial video" : "tutorial videos"}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-lilac-200/70" strokeWidth={1.5} />
                  <dt className="sr-only">Materials</dt>
                  <dd>
                    {materials.length}{" "}
                    {materials.length === 1 ? "material" : "materials"}
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-lilac-200/70" strokeWidth={1.5} />
                  <dt className="sr-only">Tutors</dt>
                  <dd>
                    {tutors.length} {tutors.length === 1 ? "tutor" : "tutors"}
                  </dd>
                </div>
              </dl>
            </div>
          </Container>
        </section>

        {/* ── Body sheet ────────────────────────────────────────────── */}
        <section className="relative isolate -mt-6 rounded-t-[1.75rem] bg-canvas sm:rounded-t-[2.5rem]">
          <BentoBackdrop tone="purple" variant="smooth" className="-z-10" />
          <PerspectiveGrid tone="purple" className="-z-10" />
          <Container className="relative space-y-16 py-12 sm:py-16">
            {/* Tutorial videos */}
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    Tutorial videos
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-[0.01em] text-slate-900">
                    Worked through, step by step
                  </h2>
                </div>
                {videos.length > 0 && (
                  <Badge tone="petrol">
                    {videos.length} {videos.length === 1 ? "video" : "videos"}
                  </Badge>
                )}
              </div>

              {videos.length > 0 ? (
                <div className="mt-6 space-y-8">
                  {groupBySemester(videos).map((bucket) => (
                    <div key={bucket.label}>
                      {showSemesters && (
                        <SemesterHead
                          label={bucket.label}
                          count={bucket.items.length}
                          noun="video"
                        />
                      )}
                      <div className={showSemesters ? "mt-4" : undefined}>
                        <CourseVideoGrid videos={bucket.items} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-600">
                  No tutorial videos for this course yet — they&apos;re added as
                  our tutors record them. In the meantime, the free lessons
                  below cover the same ground.
                </p>
              )}
            </div>

            {/* Course materials */}
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    Course materials
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-[0.01em] text-slate-900">
                    Notes, outlines and references
                  </h2>
                </div>
                {materials.length > 0 && (
                  <Badge tone="brand">
                    {materials.length}{" "}
                    {materials.length === 1 ? "material" : "materials"}
                  </Badge>
                )}
              </div>

              {materials.length > 0 ? (
                <div className="mt-6 space-y-8">
                  {groupBySemester(materials).map((bucket) => (
                    <div key={bucket.label}>
                      {showSemesters && (
                        <SemesterHead
                          label={bucket.label}
                          count={bucket.items.length}
                          noun="material"
                        />
                      )}
                      <ul
                        className={
                          showSemesters
                            ? "mt-4 grid gap-4 sm:grid-cols-2"
                            : "grid gap-4 sm:grid-cols-2"
                        }
                      >
                        {bucket.items.map((material) => (
                          <li key={material.id}>
                            <MaterialCard material={material} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm leading-relaxed text-slate-600">
                  Course materials for {course.name} haven&apos;t been uploaded
                  yet. Check back, or message us and we&apos;ll point you at the
                  right notes.
                </p>
              )}
            </div>

            {/* Tutors who teach this course */}
            <div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-slate-500">
                    Who can help
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold tracking-[0.01em] text-slate-900">
                    Tutors for {course.name}
                  </h2>
                </div>
                <Link
                  href="/tutors"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 transition-colors hover:text-brand-600"
                >
                  Browse all tutors
                </Link>
              </div>

              {tutors.length > 0 ? (
                <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {tutors.map(({ tutorProfile, profile: tutorProfileOwner, services, courses }) => (
                    <li key={tutorProfile.id} className="h-full">
                      {/* Same card as /tutors so a tutor reads identically on
                          both public pages. */}
                      <Card hover className="flex h-full flex-col">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-petrol-900 text-sm font-bold text-white">
                          {(tutorProfileOwner.full_name || "T").charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-slate-900">
                              {tutorProfileOwner.full_name || "Harcourt tutor"}
                            </span>
                            {profileIsAdmin(tutorProfileOwner) && <VerifiedBadge />}
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
                          {courses.slice(0, 3).map((item) => (
                            <Badge key={item.id}>{item.name}</Badge>
                          ))}
                          {services.length > 3 && (
                            <Badge>+{services.length - 3} more</Badge>
                          )}
                        </div>
                      )}

                      <div className="mt-auto pt-6">
                        <ContactTutorButton
                          tutorProfileId={tutorProfile.id}
                          signedIn={Boolean(profile)}
                          className="h-9 w-full rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
                        />
                      </div>
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                  <Users className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    No approved tutor has listed {course.name} yet. Browse the
                    directory — tutors who teach your field can still help.
                  </p>
                  <Link
                    href="/tutors"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Find a tutor
                  </Link>
                </div>
              )}
            </div>

            {/* Free lessons from the same field, so the page is never bare */}
            <RelatedLessons
              field={course.subject}
              excludeVideoIds={videos.map((video) => video.video_id)}
            />
          </Container>
        </section>
      </main>

      {profile && <MobileTabBar role={profile.role} />}

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

/**
 * Term heading above one semester bucket. Only rendered when something on the
 * page actually carries a term (see `showSemesters`), so the section count in
 * the header above still tells the whole story.
 */
function SemesterHead({
  label,
  count,
  noun,
}: {
  label: string;
  count: number;
  noun: "video" | "material";
}) {
  return (
    <h3 className="flex items-baseline gap-3 border-b border-slate-200 pb-2 font-display text-lg font-semibold tracking-[0.01em] text-slate-900">
      {label}
      <span className="text-[11px] font-medium uppercase tracking-widest text-slate-400">
        {count} {count === 1 ? noun : `${noun}s`}
      </span>
    </h3>
  );
}

/** One downloadable material as a link card. */
function MaterialCard({ material }: { material: CourseMaterial }) {
  return (
    <a
      href={material.file_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full items-start gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-petrol-50 text-petrol-900">
        <BookOpen className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{material.category}</Badge>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {material.file_format}
          </span>
        </span>
        <span className="mt-2 block text-sm font-semibold leading-snug text-slate-900">
          {material.title}
        </span>
        {material.description && (
          <span className="mt-1 block text-sm leading-relaxed text-slate-600">
            {material.description}
          </span>
        )}
      </span>
      {material.file_format === "LINK" ? (
        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-brand-600" />
      ) : (
        <Download className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-brand-600" />
      )}
    </a>
  );
}
