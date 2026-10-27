import { GraduationCap, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTutorByPublicCode } from "@/services/tutors/queries";
import { formatPrices } from "@/services/tutors/pricing";
import { courseParamMatches, tutorSharePath } from "@/services/tutors/share";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { ServicePrice } from "@/components/tutors/ServicePrice";
import { getCurrentProfile, profileIsAdmin } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { RequestTutorButton } from "@/components/payments/RequestTutorButton";
import { ContactTutorButton } from "@/components/tutors/ContactTutorButton";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { PerspectiveGrid } from "@/components/ui/PerspectiveGrid";
import { AnimatedGradient } from "@/components/ui/AnimatedGradient";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { FloatingNav } from "@/components/navigation/FloatingNav";
import { GlobalSearchLoader } from "@/components/search/GlobalSearchLoader";

/**
 * A tutor's shareable public profile (0031) — the link a tutor hands out:
 * /tutors/HC-T-XXXXXX. Anyone (signed in or not) can read the tutor's
 * credentials, per-course semester rates and reviews of nothing — just the
 * verified facts — and request them from right here. The data comes from the
 * same cached, defensively-mapped query as the directory (approved tutors
 * only; a tutor who switched to student stops being reachable).
 */
export const dynamic = "force-dynamic";

/** One offering matched by a `?course=` value (code or row id). */
function findFocusedOffering(
  tutor: NonNullable<Awaited<ReturnType<typeof getTutorByPublicCode>>>,
  wanted: string | null,
) {
  if (!wanted) return null;
  const byId = new Map(tutor.courses.map((course) => [course.id, course]));
  for (const service of tutor.services) {
    const course = byId.get(service.course_id);
    if (!course) continue;
    if (
      courseParamMatches({ id: course.id, code: course.code ?? null }, wanted)
    ) {
      return { service, course };
    }
  }
  return null;
}

/** The cheapest fee across every format the tutor offers, in whole cedis. */
function lowestOfferingPrice(
  tutor: NonNullable<Awaited<ReturnType<typeof getTutorByPublicCode>>>,
): number | null {
  const prices = tutor.services
    .flatMap((service) => {
      const { oneOnOne, group } = formatPrices(service);
      return [oneOnOne, group];
    })
    .filter((price): price is number => price != null);
  if (prices.length > 0) return Math.min(...prices);
  return tutor.tutorProfile.rate_per_semester;
}

/**
 * Link previews.
 *
 * A tutor shares `/tutors/HC-T-…?course=ME%20255` in WhatsApp, and WhatsApp's
 * crawler renders the OG title + description instead of the URL. The card
 * therefore names the COURSE, not just the tutor — "ME 255 with Kofi Mensah —
 * GH₵60/semester" is the thing a student is deciding about. Next's
 * `htmlLimitedBots` list includes WhatsApp, so this metadata is awaited and
 * blocking for that crawler (nothing streams past it).
 *
 * The canonical URL keeps `?course=` so Google treats the per-course link as
 * the same page rather than a duplicate.
 */
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ course?: string | string[] }>;
}): Promise<Metadata> {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const tutor = await getTutorByPublicCode(code);

  if (!tutor) {
    return {
      title: "Tutor not found — Harcourt",
      robots: { index: false, follow: false },
    };
  }

  const name = tutor.profile.full_name || "Harcourt tutor";
  const wanted = typeof query.course === "string" ? query.course : null;
  const focused = findFocusedOffering(tutor, wanted);
  const price = lowestOfferingPrice(tutor);

  const courseLabel = focused
    ? focused.course.code
      ? `${focused.course.code} — ${focused.course.name}`
      : focused.course.name
    : null;

  const priceLabel = price != null ? `GH₵${price.toLocaleString()}` : null;

  const title = courseLabel
    ? `${courseLabel} with ${name}${priceLabel ? ` — ${priceLabel}/semester` : ""}`
    : `${name} — verified tutor${priceLabel ? ` from ${priceLabel}/semester` : ""}`;

  const description = courseLabel
    ? `Book ${name} for ${courseLabel} at KNUST. Verified by Harcourt${
        priceLabel ? `, ${priceLabel} per semester` : ""
      }. Payments are handled by the Harcourt team, never the tutor.`
    : tutor.tutorProfile.bio ??
      `Book ${name} for KNUST engineering tutoring on Harcourt Educational Consult.`;

  const canonicalPath = tutorSharePath(
    tutor.profile.public_code ?? code,
    focused
      ? { id: focused.course.id, code: focused.course.code ?? null }
      : null,
  );

  // Rendered by /api/og/tutor (ImageResponse) so every shared link gets a
  // branded card with the tutor and course on it, even before anyone uploads
  // a photo. The card's bundled font has no cedi glyph (U+20B5), so the IMAGE
  // says "GHS 60/semester" while the title/description above keep GH₵ — a
  // missing-glyph box is worse than the ISO code.
  const ogPrice = price != null ? `GHS ${price.toLocaleString()}/semester` : "";
  const ogImage = siteUrl(
    `/api/og/tutor?${new URLSearchParams({
      name,
      ...(courseLabel ? { course: courseLabel } : {}),
      ...(ogPrice ? { price: ogPrice } : {}),
    }).toString()}`,
  );

  return {
    title,
    description,
    alternates: { canonical: siteUrl(canonicalPath) },
    openGraph: {
      type: "profile",
      siteName: SITE_NAME,
      url: siteUrl(canonicalPath),
      title,
      description,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
    robots: { index: true, follow: true },
  };
}

export default async function TutorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ course?: string | string[]; request?: string | string[] }>;
}) {
  const [{ code }, query, profile] = await Promise.all([
    params,
    searchParams,
    getCurrentProfile(),
  ]);
  // `getTutorByPublicCode` normalises the code (case, stray whitespace,
  // half-encoded links), so a mangled share link still resolves instead of
  // showing "page not found".
  const tutor = await getTutorByPublicCode(code);
  if (!tutor) notFound();

  const { tutorProfile: tp, profile: tutorUser, services, courses } = tutor;
  const name = tutorUser.full_name || "Harcourt tutor";
  const courseNames = new Map(courses.map((c) => [c.id, c]));
  const allOfferings = services
    .map((s) => {
      const course = courseNames.get(s.course_id);
      if (!course) return null;
      return {
        serviceId: s.id,
        courseId: s.course_id,
        course,
        service: s,
        prices: formatPrices(s),
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  /**
   * Per-course link (`/tutors/HC-T-…?course=ME%20255`, see share.ts): open the
   * offering the tutor meant first, and pre-select it in the request dialog.
   * A param that matches nothing — a typo, or a course the tutor has since
   * dropped — falls back to the plain profile rather than 404ing: the link
   * still works, it just stops being specific.
   */
  const wanted = typeof query.course === "string" ? query.course : null;
  const focused = wanted
    ? allOfferings.find((o) =>
        courseParamMatches(
          { id: o.courseId, code: o.course.code ?? null },
          wanted,
        ),
      )
    : undefined;
  const offerings = focused
    ? [focused, ...allOfferings.filter((o) => o !== focused)]
    : allOfferings;

  /**
   * Return-from-auth (`?course=…&request=1`, set by RequestTutorButton when a
   * signed-out visitor taps Request): open the request dialog automatically on
   * the course the link named — the whole point of sending them through auth
   * instead of dropping them on the dashboard. `RequestTutorButton` then
   * strips `request=1` so a refresh does not reopen it.
   */
  const wantsRequest =
    (typeof query.request === "string" ? query.request : "") === "1";
  const autoOpenCourseId = focused?.courseId ?? offerings[0]?.courseId;

  /**
   * "From" price: the cheapest format this tutor actually offers. The legacy
   * profile-wide rate (no longer asked for on the dashboard) is only a
   * fallback, so a tutor priced per course never shows a stale number.
   */
  const offeringPrices = allOfferings
    .flatMap((o) => [o.prices.oneOnOne, o.prices.group])
    .filter((price): price is number => price != null);
  const lowestPrice =
    offeringPrices.length > 0
      ? Math.min(...offeringPrices)
      : tp.rate_per_semester;

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <FloatingNav
        links={[
          { href: "/", label: "Home" },
          { href: "/tutors", label: "Find a tutor" },
          { href: "/courses", label: "Courses" },
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
          <AuthTrigger
            tab="sign-in"
            className="inline-flex h-9 rounded-full px-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 sm:h-10 sm:px-3.5 sm:text-sm"
          >
            Sign in
          </AuthTrigger>
        )}
      </FloatingNav>

      <Suspense>
        <GlobalSearchLoader />
      </Suspense>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <main className="relative flex-1">
        <section className="relative overflow-hidden">
          <AnimatedGradient size="90%" />
          <Container className="relative pb-16 pt-28">
            <Link
              href="/tutors"
              className="text-xs font-semibold uppercase tracking-widest text-lilac-100/70 underline-offset-4 hover:text-lilac-100 hover:underline"
            >
              ← All tutors
            </Link>
            {/* The tutor's name, not a generic "Tutor profile": on a phone the
                card below sits under a full-height hero, so the first screen
                has to say WHOSE profile this is. */}
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-white sm:text-4xl">
              {name}
            </h1>
            <p className="mt-3 max-w-2xl text-lilac-100/90">
              Verified by the Harcourt team — credentials checked, rates
              published, payments handled by us.
            </p>
          </Container>
        </section>

        {/* The profile sheet — same seam as the directory (see /tutors). */}
        <section className="relative isolate -mt-6 rounded-t-[1.75rem] bg-canvas sm:rounded-t-[2.5rem]">
          <BentoBackdrop tone="purple" variant="smooth" className="-z-10" />
          <PerspectiveGrid tone="purple" className="-z-10" />
          <Container className="relative pb-24 pt-10 lg:pb-10">
            <Card className="mx-auto max-w-3xl p-6 sm:p-8">
              <div className="flex flex-wrap items-start gap-4">
                <TutorAvatar name={name} src={tutorUser.avatar_url} size={56} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-2xl font-bold tracking-tight text-slate-900">
                      {name}
                    </span>
                    {tutorUser.is_admin && <VerifiedBadge />}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone="green">
                      <ShieldCheck className="h-3 w-3" />
                      Verified tutor
                    </Badge>
                    <Badge tone="brand">
                      {offerings.length} course{offerings.length === 1 ? "" : "s"} offered
                    </Badge>
                    {lowestPrice != null && (
                      <span className="text-sm font-medium text-slate-600">
                        From GH₵{lowestPrice.toLocaleString()}/semester
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {tp.bio && (
                <p className="mt-5 text-sm leading-relaxed text-slate-600">
                  {tp.bio}
                </p>
              )}

              {tp.qualifications && (
                <div className="mt-4 flex items-start gap-2 rounded-md bg-slate-50 px-4 py-3">
                  <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Qualifications
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-700">
                      {tp.qualifications}
                    </p>
                  </div>
                </div>
              )}

              {/* Courses & semester rates — one request button per offering. */}
              <h2 className="mt-8 font-display text-lg font-semibold text-slate-900">
                Courses & semester rates
              </h2>
              {focused && (
                <p className="mt-3 rounded-md border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm leading-relaxed text-brand-900">
                  You opened this tutor&apos;s link for{" "}
                  <span className="font-semibold">
                    {focused.course.code
                      ? `${focused.course.code} — ${focused.course.name}`
                      : focused.course.name}
                  </span>
                  . It&apos;s listed first below, with its own request button —
                  open it and the form is already set to that course.
                </p>
              )}
              {offerings.length === 0 ? (
                <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  This tutor hasn&apos;t published course rates yet — reach out and
                  ask.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {offerings.map((o) => (
                    <li
                      key={o.serviceId}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border bg-white px-4 py-3 shadow-xs ${
                        o.courseId === focused?.courseId
                          ? "border-brand-300 ring-2 ring-brand-600/15"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {o.course.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {o.course.code ?? "No code"}
                          {o.course.credits != null
                            ? ` · ${o.course.credits} credits`
                            : ""}
                          {o.course.semester != null
                            ? ` · Semester ${o.course.semester}`
                            : ""}
                          {" · "}
                          <ServicePrice service={o.service} />
                        </p>
                      </div>
                      <RequestTutorButton
                        tutorProfileId={tp.id}
                        // Each row's button opens on THAT course. A per-course
                        // link (?course=) therefore lands the student on a
                        // button that is already set to the course the tutor
                        // sent — and every other row is right too.
                        defaultCourseId={o.courseId}
                        // A signed-out student who taps Request comes back to
                        // THIS row's course with the dialog open, rather than
                        // to a generic dashboard.
                        profilePath={tutorSharePath(
                          tutorUser.public_code ?? code,
                          { id: o.courseId, code: o.course.code ?? null },
                        )}
                        autoOpen={wantsRequest && o.courseId === autoOpenCourseId}
                        offerings={offerings.map((off) => ({
                          courseId: off.courseId,
                          name: off.course.name,
                          priceOneOnOne: off.prices.oneOnOne,
                          priceGroup: off.prices.group,
                        }))}
                        signedIn={Boolean(profile?.id)}
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-brand-600 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-[0.98]"
                      />
                    </li>
                  ))}
                </ul>
              )}

              {/* Payment ground rule, stated where the money conversation starts. */}
              <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
                You make and discuss payments only with Harcourt admins — never
                with the tutor. Rates above are per semester, and checkout is
                handled by Paystack.
              </p>

              <div className="mt-6">
                <ContactTutorButton
                  tutorProfileId={tp.id}
                  signedIn={Boolean(profile?.id)}
                  className="h-10 w-full rounded-md bg-slate-900 px-4 text-sm font-semibold text-white shadow-xs hover:bg-slate-800"
                />
              </div>
            </Card>

            <div className="mx-auto mt-6 max-w-3xl text-center">
              <Link
                href="/tutors"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
              >
                <Users className="h-4 w-4" />
                Browse all tutors
              </Link>
            </div>
          </Container>
        </section>
      </main>

      {profile && <MobileTabBar role={profile.role} isAdmin={profileIsAdmin(profile)} />}
    </div>
  );
}
