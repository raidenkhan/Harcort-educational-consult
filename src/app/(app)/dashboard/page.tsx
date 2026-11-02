import Link from "next/link";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { requireProfile, profileIsAdmin } from "@/services/auth/queries";
import { listStudentRequests } from "@/services/requests/queries";
import type { TutorRequestView } from "@/services/requests/queries";
import { listStudentEngagements } from "@/services/payments/queries";
import type { EngagementView } from "@/services/payments/queries";
import { listSessionsForStudent } from "@/services/sessions/queries";
import type { SessionView } from "@/services/sessions/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PaymentGroundRules } from "@/components/support/PaymentGroundRules";
import { StudentRequestsCard } from "@/components/payments/StudentRequestsCard";
import { StudentGlance } from "@/components/student/StudentGlance";

/**
 * Student dashboard — Home. The urgent surface only: an at-a-glance strip
 * (next lesson / fees due / open requests), open requests (which carry the
 * paywall), the payment ground rules, and the two doors out (browse tutors,
 * admin console). Courses, timetable, money and settings each have their own
 * tab now; the shell and tabs live in layout.tsx.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string; payment_status?: string }>;
}) {
  const profile = await requireProfile();

  const params = await searchParams;
  const paymentReturn = params.payment === "return";
  const paymentConfirmed = params.payment_status === "received";
  // Paystack took the money but our ledger refused to credit it (an overpay, a
  // currency mismatch, a settled installment). The sweep cannot fix it — a
  // human has to reconcile — so the student must not be told to wait.
  const paymentRefused = params.payment_status === "refused";

  // ONE round for the whole page: the strip and the requests card read from
  // the same rows (the card receives them via `preloaded`), so the overview
  // costs three parallel reads — sessions, requests, agreements — not five.
  let sessions: SessionView[] = [];
  let requests: TutorRequestView[] = [];
  let engagements: EngagementView[] = [];
  if (profile.role === "student") {
    [sessions, requests, engagements] = await Promise.all([
      listSessionsForStudent(),
      listStudentRequests(profile),
      listStudentEngagements(profile),
    ]);
  }
  const outstanding = engagements
    .filter((e) => e.status !== "cancelled" && e.status !== "completed")
    .reduce((sum, e) => sum + e.remainingPesewas, BigInt(0));
  const openRequests = requests.filter((r) => r.status === "pending").length;

  return (
    <>
      {/* Back from Paystack. `/api/payments/return` already verified the
          charge and applied it, so "received" is the normal happy path;
          "pending" means Paystack had not settled it yet (or verify was
          momentarily unavailable) and the sweep will retry; "refused" means
          the charge is real but the ledger rejected it, which only a human
          can resolve. The receipt itself lives on the Payments tab. */}
      {paymentReturn && (
        <div
          className={
            paymentConfirmed
              ? "mt-6 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
              : paymentRefused
                ? "mt-6 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                : "mt-6 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          }
        >
          {paymentConfirmed ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : paymentRefused ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {paymentConfirmed ? (
              <>
                Payment received — your booking is confirmed. We&apos;ve emailed
                you and your tutor.{" "}
                <Link
                  href="/dashboard/payments"
                  className="font-semibold underline underline-offset-2"
                >
                  View your payments
                </Link>
              </>
            ) : paymentRefused ? (
              "Your payment went through, but we couldn't apply it to your account automatically. Please contact the admin team with your Paystack reference so we can credit it."
            ) : (
              "Paystack sent you back. We're confirming the payment with Paystack — open Payments in a minute if it doesn't show there."
            )}
          </span>
        </div>
      )}

      {/* At a glance first: the three questions a student opens the dashboard
          with, each a door to its tab. It reads the same rows the requests
          card renders, so the overview is one fetch, not two. */}
      {profile.role === "student" && (
        <StudentGlance
          sessions={sessions}
          outstandingPesewas={outstanding}
          openRequests={openRequests}
        />
      )}

      {/* Then the urgent thing: an open request carries the paywall and the
          "pay now" button (the strip's Requests tile anchors here). The ground
          rules note sits right after it because it explains payment policy. */}
      {profile.role === "student" && (
        <div id="requests" className="mt-8 scroll-mt-24">
          <StudentRequestsCard
            hideWhenEmpty
            preloaded={{ profile, requests, engagements }}
          />
        </div>
      )}
      {profile.role === "student" && <PaymentGroundRules className="mt-8" />}

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {profile.role === "student" && (
          <Card>
            <h2 className="text-lg font-semibold text-slate-900">Find a tutor</h2>
            <p className="mt-1 text-sm text-slate-600">
              Browse approved tutors by subject and course, then reach out
              when you find the right match.
            </p>
            <Link href="/tutors" className="mt-4 block">
              <Button className="w-full sm:w-auto">Browse tutors</Button>
            </Link>
          </Card>
        )}

        {profileIsAdmin(profile) && (
          <Card>
            <h2 className="text-lg font-semibold text-slate-900">
              Tutor applications
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Review new tutor applications, approve or reject them, and
              keep an eye on attendance.
            </p>
            <Link href="/admin" className="mt-4 block">
              <Button className="w-full sm:w-auto">Open admin console</Button>
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
