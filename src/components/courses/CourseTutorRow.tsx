import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import type { CartOffering } from "@/components/cart/AddToCartButton";
import type { TutorListing } from "@/services/tutors/listing";
import { BookTutorButton } from "@/components/tutors/BookTutorButton";
import { Badge } from "@/components/ui/Badge";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { cn } from "@/lib/cn";

const cedis = (n: number) => `GH₵${n.toLocaleString("en-GH")}`;

/**
 * One tutor who teaches one course, with "Choose & pay" — the Book-tutor
 * dialog opened on that course (format, semesters, total, one Paystack
 * charge). Shared by Dashboard → Courses (inline under each course) and the
 * dashboard course page, so booking looks the same wherever it happens.
 */
export function CourseTutorRow({
  offering,
  tutor,
  booked,
  courseCode,
  compact = false,
}: {
  offering: CartOffering;
  tutor?: TutorListing;
  /** The student already has a live booking with this tutor for this course. */
  booked: boolean;
  /** For the "View profile" link's ?course= (opens that offering first). */
  courseCode: string | null;
  /** Tighter layout for the inline list on the Courses page. */
  compact?: boolean;
}) {
  const about = tutor?.tutorProfile.qualifications || tutor?.tutorProfile.bio;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3", compact ? "py-3" : "")}>
      <TutorAvatar
        name={offering.tutorName}
        src={tutor?.profile.avatar_url}
        size={compact ? 40 : 48}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
          {offering.tutorName}
          {tutor?.profile.is_admin && <VerifiedBadge />}
          {booked && (
            <Badge tone="green">
              <CheckCircle2 className="mr-1 inline h-3 w-3" aria-hidden="true" />
              Booked
            </Badge>
          )}
        </p>
        {about && !compact && (
          <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{about}</p>
        )}
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {offering.priceOneOnOne !== null && (
            <span>
              One-on-one{" "}
              <span className="font-semibold text-slate-900">{cedis(offering.priceOneOnOne)}</span>
              /semester
            </span>
          )}
          {offering.priceGroup !== null && (
            <span>
              Group <span className="font-semibold text-slate-900">{cedis(offering.priceGroup)}</span>
              /semester
            </span>
          )}
          {offering.tutorCode && (
            <Link
              href={`/tutors/${offering.tutorCode}${courseCode ? `?course=${encodeURIComponent(courseCode)}` : ""}`}
              className="font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              View profile
            </Link>
          )}
        </p>
      </div>
      <BookTutorButton
        tutorName={offering.tutorName}
        offerings={[offering]}
        initialSelected={[offering.tutorServiceId]}
        signedIn
        label={booked ? "Book again" : "Choose & pay"}
        className={compact ? "h-9 px-3.5" : "h-10 px-4"}
      />
    </div>
  );
}
