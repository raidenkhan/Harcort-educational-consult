"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Mail, Search, ShieldCheck, SearchX } from "lucide-react";
import type { TutorListing } from "@/services/tutors/queries";
import { formatPrices } from "@/services/tutors/pricing";
import { BookTutorButton } from "@/components/tutors/BookTutorButton";
import type { CartOffering } from "@/components/cart/AddToCartButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { cn } from "@/lib/cn";

/**
 * Browse-and-search for tutors. Runs entirely client-side over the cached
 * approved-tutor list (server passes it down) — instant filtering, no extra
 * requests. Search matches names, bios, qualifications and course names;
 * subject chips narrow by taxonomy.
 */
export function TutorExplorer({
  tutors,
  signedIn,
  initialQuery = "",
}: {
  tutors: TutorListing[];
  signedIn: boolean;
  /** Prefill from /tutors?q= (global search deep-links a tutor here). */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [subject, setSubject] = useState<string | null>(null);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const tutor of tutors) {
      for (const course of tutor.courses) set.add(course.subject);
    }
    return Array.from(set).sort();
  }, [tutors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tutors.filter((t) => {
      if (subject && !t.courses.some((c) => c.subject === subject)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        t.profile.full_name,
        t.tutorProfile.bio,
        t.tutorProfile.qualifications,
        ...t.courses.map((c) => `${c.subject} ${c.name}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [tutors, query, subject]);

  return (
    <div>
      {/* ── Search + subject filters ─────────────────────────────── */}
      <div className="mt-8 rounded-lg border border-slate-200 bg-white/85 p-4 shadow-card backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, subject, course, or qualification…"
            aria-label="Search tutors"
            className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          />
        </div>
        {subjects.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <SubjectChip active={subject === null} onClick={() => setSubject(null)}>
              All
            </SubjectChip>
            {subjects.map((s) => (
              <SubjectChip
                key={s}
                active={subject === s}
                onClick={() => setSubject(subject === s ? null : s)}
              >
                {s}
              </SubjectChip>
            ))}
          </div>
        )}
      </div>

      {/* ── Result count ─────────────────────────────────────────── */}
      <p className="mt-6 text-sm text-slate-600" aria-live="polite">
        {filtered.length === 0
          ? "No tutors match your search."
          : `${filtered.length} ${filtered.length === 1 ? "tutor" : "tutors"} ${
              query || subject ? "match" : "available"
            }`}
      </p>

      {/* ── Cards ────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-8 text-center sm:p-16">
          <SearchX className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Try a different search term or clear the subject filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSubject(null);
            }}
            className="mt-4 text-sm font-semibold text-slate-900 underline-offset-2 transition hover:underline"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tutor) => (
            <TutorCard key={tutor.tutorProfile.id} tutor={tutor} signedIn={signedIn} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition duration-150 active:scale-[0.96]",
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
      )}
    >
      {children}
    </button>
  );
}

function TutorCard({
  tutor,
  signedIn,
}: {
  tutor: TutorListing;
  signedIn: boolean;
}) {
  const { tutorProfile: tp, profile, services, courses, contactEmail } = tutor;
  const tutorName = profile.full_name || "Harcourt tutor";
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // Everything the Book dialog can sell: one row per course offering, with
  // its per-format, per-semester prices (0031). The server re-prices at
  // checkout, so these are for display and selection only.
  const offerings: CartOffering[] = services
    .map((s): CartOffering | null => {
      const course = courseById.get(s.course_id);
      if (!course) return null;
      const prices = formatPrices(s);
      return {
        tutorServiceId: s.id,
        tutorProfileId: tp.id,
        tutorName,
        tutorCode: profile.public_code ?? null,
        courseId: s.course_id,
        courseName: course.name,
        courseCode: course.code ?? null,
        priceOneOnOne: prices.oneOnOne,
        priceGroup: prices.group,
      };
    })
    .filter((o): o is CartOffering => o !== null);

  /**
   * The card's headline price. A tutor prices each course per format (0031),
   * so the honest number is the cheapest format they actually offer — the
   * legacy profile rate is only a fallback for rows that predate per-course
   * pricing (the tutor dashboard no longer asks for one).
   */
  const offeringPrices = offerings
    .flatMap((o) => [o.priceOneOnOne, o.priceGroup])
    .filter((price): price is number => price != null);
  const lowestOffering =
    offeringPrices.length > 0 ? Math.min(...offeringPrices) : null;
  const headlineRate = lowestOffering ?? tp.rate_per_semester;

  const profileHref = profile.public_code
    ? `/tutors/${encodeURIComponent(profile.public_code)}`
    : null;
  // "Send email" opens Gmail's compose page in a new tab, addressed to the
  // tutor. A bare `mailto:` does nothing visible on a machine with no mail
  // app configured — which is most student laptops and every school lab PC.
  const emailHref = contactEmail
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        contactEmail,
      )}&su=${encodeURIComponent(`Tutoring enquiry via Harcourt — ${tutorName}`)}`
    : null;

  return (
    <Card hover className="flex flex-col">
      {/* ── Who ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {profileHref ? (
          <Link
            href={profileHref}
            aria-label={`View ${tutorName}'s profile`}
            className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <TutorAvatar name={tutorName} src={profile.avatar_url} size={52} />
          </Link>
        ) : (
          <TutorAvatar name={tutorName} src={profile.avatar_url} size={52} />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            {profileHref ? (
              <Link
                href={profileHref}
                className="truncate font-display text-base font-semibold text-slate-900 transition hover:text-brand-700"
              >
                {tutorName}
              </Link>
            ) : (
              <span className="truncate font-display text-base font-semibold text-slate-900">
                {tutorName}
              </span>
            )}
            {/* Client component — use the raw flag (the isAdmin helper lives
                in a server-only module). Post-0008 rows always carry it. */}
            {profile.is_admin && <VerifiedBadge />}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="green">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </Badge>
            <p className="text-xs font-medium text-slate-600">
              {headlineRate != null
                ? `${lowestOffering != null ? "From " : ""}GH₵${headlineRate.toLocaleString()}/semester`
                : "Rates on request"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Bio ─────────────────────────────────────────────────────── */}
      <p
        className={cn(
          "mt-4 line-clamp-4 text-sm leading-relaxed",
          tp.bio ? "text-slate-700" : "italic text-slate-400",
        )}
      >
        {tp.bio || "This tutor hasn't written a bio yet."}
      </p>

      {offerings.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {offerings.length} {offerings.length === 1 ? "course" : "courses"} ·{" "}
            {offerings
              .slice(0, 3)
              .map((o) => o.courseCode ?? o.courseName)
              .join(", ")}
            {offerings.length > 3 ? "…" : ""}
          </span>
        </p>
      )}

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="mt-auto grid grid-cols-2 gap-2 pt-6">
        <BookTutorButton
          tutorName={tutorName}
          offerings={offerings}
          signedIn={signedIn}
          className="h-11 w-full"
        />
        {emailHref ? (
          <a
            href={emailHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-800 shadow-xs transition duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97]"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Send email
          </a>
        ) : (
          <span className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-200 text-sm font-medium text-slate-400">
            <Mail className="h-4 w-4" aria-hidden="true" />
            No email
          </span>
        )}
      </div>
    </Card>
  );
}
