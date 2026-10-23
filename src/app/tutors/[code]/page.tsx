import { GraduationCap, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTutorByPublicCode } from "@/services/tutors/queries";
import { getCurrentProfile } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { RequestTutorButton } from "@/components/payments/RequestTutorButton";
import { ContactTutorButton } from "@/components/tutors/ContactTutorButton";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const tutor = await getTutorByPublicCode(decodeURIComponent(code));
  const name = tutor?.profile.full_name || "Harcourt tutor";
  return {
    title: `${name} — tutor profile`,
    description:
      tutor?.tutorProfile.bio ??
      `Book ${name} for KNUST engineering tutoring on Harcourt Educational Consult.`,
    robots: { index: Boolean(tutor) },
  };
}

export default async function TutorProfilePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const [{ code }, profile] = await Promise.all([
    params,
    getCurrentProfile(),
  ]);
  const tutor = await getTutorByPublicCode(decodeURIComponent(code));
  if (!tutor) notFound();

  const { tutorProfile: tp, profile: tutorUser, services, courses } = tutor;
  const name = tutorUser.full_name || "Harcourt tutor";
  const courseNames = new Map(courses.map((c) => [c.id, c]));
  const offerings = services
    .map((s) => ({
      serviceId: s.id,
      courseId: s.course_id,
      course: courseNames.get(s.course_id) ?? null,
      price: s.price,
    }))
    .filter((o) => o.course !== null);

  return (
    <div className="relative flex flex-1 flex-col pb-20 lg:pb-0">
      <FloatingNav
        links={[
          { href: "/", label: "Home" },
          { href: "/tutors", label: "Find a tutor" },
          { href: "/library", label: "Library" },
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
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Tutor profile
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
          <Container className="relative py-10">
            <Card className="mx-auto max-w-3xl p-6 sm:p-8">
              <div className="flex flex-wrap items-start gap-4">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-slate-900 font-display text-xl font-bold text-white">
                  {name.charAt(0).toUpperCase()}
                </span>
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
                    {tp.rate_per_semester != null && (
                      <span className="text-sm font-medium text-slate-600">
                        From GH₵{tp.rate_per_semester.toLocaleString()}/semester
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
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 shadow-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {o.course!.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {o.course!.code ?? "No code"}
                          {o.course!.credits != null
                            ? ` · ${o.course!.credits} credits`
                            : ""}
                          {` · GH₵${o.price.toLocaleString()}/semester`}
                        </p>
                      </div>
                      <RequestTutorButton
                        tutorProfileId={tp.id}
                        offerings={offerings.map((off) => ({
                          courseId: off.courseId,
                          name: off.course!.name,
                          price: off.price,
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

      <MobileTabBar />
    </div>
  );
}
