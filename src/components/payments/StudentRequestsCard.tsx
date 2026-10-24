import { Clock, GraduationCap, ShieldCheck } from "lucide-react";
import { requireProfile } from "@/services/auth/queries";
import { listStudentRequests } from "@/services/requests/queries";
import { dueDateLabel } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { WithdrawRequestButton } from "./WithdrawRequestButton";
import { PayInstallmentButton } from "./PayInstallmentButton";
import { CommitToCourseButton } from "./CommitToCourseButton";
import { PaymentPlanRequestButton } from "./PaymentPlanRequestButton";
import { listStudentEngagements } from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";

/**
 * Student requests card — "My tutor requests" on the dashboard.
 *
 * Statuses and what each unlocks:
 *   pending  → the PAYWALL: the full semester fee is due now (0024 — pay to
 *              activate, the tutor accepts to schedule; 0029 — 100% upfront).
 *              Withdraw stays available, and the paywall carries the
 *              ask-an-admin paths for a student who can't pay in full.
 *   accepted → the engaged agreement, with the first unpaid installment's
 *              pay button (hidden if already paid/active)
 *   declined → closed, with the tutor's decision time
 *   withdrawn → history
 *
 * Payment CTA resolution: the request's course is matched to the student's
 * open engagement installments by tutor+course; the first payable
 * installment wins.
 */

/** The tutor's full quote, in pesewas — the paywall amount (0029: 100%). */
function totalPesewas(priceInCedis: number | null): bigint | null {
  if (!priceInCedis || priceInCedis <= 0) return null;
  return BigInt(Math.round(priceInCedis * 100));
}

const STATUS_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" }
> = {
  pending: { label: "Waiting for tutor", tone: "amber" },
  accepted: { label: "Accepted — payment unlocked", tone: "green" },
  declined: { label: "Declined", tone: "red" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

/** Module-level (react-hooks/purity): match accepted requests to payables.
 *  Overdue-but-unpaid installments are still payable, so no day-math here —
  the DB status alone decides. */
function withPayable(
  requests: Awaited<ReturnType<typeof listStudentRequests>>,
  engagements: Awaited<ReturnType<typeof listStudentEngagements>>,
) {
  return requests.map((request) => {
    let payable: { engagementId: string; installmentId: string; amount: bigint } | null = null;
    if (request.status === "accepted") {
      const match = engagements.find(
        (e) => e.tutorName === request.tutorName && e.status !== "cancelled",
      );
      const installment = match?.installments.find(
        (i) => i.status === "pending" || i.status === "overdue",
      );
      if (match && installment) {
        payable = {
          engagementId: match.id,
          installmentId: installment.id,
          amount: installment.amount,
        };
      }
    }
    return { ...request, payable };
  });
}

export async function StudentRequestsCard({
  hideWhenEmpty = false,
}: {
  /**
   * Render nothing instead of the "how this works" placeholder when the
   * student has no requests. The dashboard puts this card at the TOP (urgent
   * first), where the placeholder would only push the courses down to say
   * that nothing is waiting — a student with nothing pending should land on
   * their courses instead.
   */
  hideWhenEmpty?: boolean;
}) {
  const profile = await requireProfile();
  const [requests, engagements] = await Promise.all([
    listStudentRequests(profile),
    listStudentEngagements(profile),
  ]);

  const rows = withPayable(requests, engagements);

  if (rows.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <Card className="border-dashed">
        <h2 className="text-lg font-semibold text-slate-900">My tutor requests</h2>
        <p className="mt-1 text-sm text-slate-600">
          When you request a tutor from the directory, the request appears
          here with its payment wall — pay the semester fee to activate your
          sessions, or ask an admin for a plan.
        </p>
      </Card>
    );
  }

  return (
    <section aria-label="My tutor requests" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">My tutor requests</h2>
        <span className="text-sm text-slate-500">{rows.length} sent</span>
      </div>

      {rows.map((request) => {
        const badge = STATUS_BADGE[request.status] ?? {
          label: request.status,
          tone: "neutral" as const,
        };
        const alreadyEngaged = engagements.some(
          (e) => e.tutorName === request.tutorName && e.status !== "cancelled",
        );
        const due = totalPesewas(request.tutorServicePrice);
        return (
          <Card key={request.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900">
                  {request.tutorName || "Tutor"}
                </h3>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-400" />
                  {request.courseName ?? "Course to decide"}
                </p>
                {request.message && (
                  <p className="mt-1 max-w-xl text-sm text-slate-500">“{request.message}”</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  Sent {dueDateLabel(new Date(request.createdAt)).replace("Due ", "")}
                  {request.respondedAt
                    ? ` · answered ${dueDateLabel(new Date(request.respondedAt)).replace("Due ", "")}`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={badge.tone}>{badge.label}</Badge>
                {request.status === "pending" && (
                  <WithdrawRequestButton requestId={request.id} />
                )}
              </div>
            </div>

            {/* Paywall — opened the moment the request was sent (0024). */}
            {request.status === "pending" &&
              request.tutorServiceId &&
              due !== null &&
              !alreadyEngaged && (
                <div className="mt-4 rounded-lg border border-brand-200 bg-brand-50/60 px-4 py-3.5">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                    <ShieldCheck className="h-4 w-4" />
                    Payment required
                  </p>
                  <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-700">
                    Pay the full semester fee ({formatGhs(due)}) to activate
                    your
                    sessions. The tutor confirms the timetable once you&apos;ve
                    paid. Payments go to Harcourt, never to the tutor.
                  </p>
                  <div className="mt-3">
                    <CommitToCourseButton
                      tutorServiceId={request.tutorServiceId}
                      label={`Pay ${formatGhs(due)} now`}
                      signedIn={Boolean(profile.id)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  <div className="mt-4 border-t border-brand-200/70 pt-3">
                    <PaymentPlanRequestButton
                      requestId={request.id}
                      courseName={request.courseName ?? undefined}
                      feeDisplay={due !== null ? formatGhs(due) : undefined}
                    />
                  </div>
                </div>
              )}

            {request.status === "accepted" && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
                {request.payable ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-emerald-800">
                      Accepted! Pay the semester fee (
                      {formatGhs(request.payable.amount)}) to activate your
                      sessions.
                    </p>
                    <PayInstallmentButton
                      engagementId={request.payable.engagementId}
                      installmentId={request.payable.installmentId}
                      amountDisplay={formatGhs(request.payable.amount)}
                    />
                  </div>
                ) : engagements.some(
                      (e) =>
                        e.tutorName === request.tutorName && e.status !== "cancelled",
                    ) ? (
                  <p className="text-sm text-emerald-800">
                    Accepted. This agreement is already paid or in progress — see
                    My payments.
                  </p>
                ) : request.tutorServiceId ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-emerald-800">
                      Accepted! Set up your payment to activate your
                      sessions.
                    </p>
                    <CommitToCourseButton
                      tutorServiceId={request.tutorServiceId}
                      label="Set up & pay"
                      signedIn={Boolean(profile.id)}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-emerald-800">
                    Accepted. Your tutor hasn&apos;t published a price for this
                    course yet — we&apos;ll email you when your payment button
                    unlocks.
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </section>
  );
}
