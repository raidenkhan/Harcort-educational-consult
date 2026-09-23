import { Clock, GraduationCap } from "lucide-react";
import { requireProfile } from "@/services/auth/queries";
import { listStudentRequests } from "@/services/requests/queries";
import { dueDateLabel } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { WithdrawRequestButton } from "./WithdrawRequestButton";
import { PayInstallmentButton } from "./PayInstallmentButton";
import { listStudentEngagements } from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";

/**
 * Student requests card — "My tutor requests" on the dashboard.
 *
 * Statuses and what each unlocks:
 *   pending  → waiting on the tutor (withdraw available)
 *   accepted → the Pay 50% CTA appears (finds the engagement's first
 *              unpaid installment; hidden if already paid/active)
 *   declined → closed, with the tutor's decision time
 *   withdrawn → history
 *
 * Payment CTA resolution: the accepted request's course is matched to the
 * student's open engagement installments by tutor+course; the first
 * payable installment wins.
 */

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

export async function StudentRequestsCard() {
  const profile = await requireProfile();
  const [requests, engagements] = await Promise.all([
    listStudentRequests(profile),
    listStudentEngagements(profile),
  ]);

  const rows = withPayable(requests, engagements);

  if (rows.length === 0) {
    return (
      <Card className="border-dashed">
        <h2 className="text-lg font-semibold text-slate-900">My tutor requests</h2>
        <p className="mt-1 text-sm text-slate-600">
          When you request a tutor from the directory, the request and its
          status appear here — and once accepted, your payment button
          unlocks.
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

            {request.status === "accepted" && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
                {request.payable ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-emerald-800">
                      Accepted! Pay the first 50% (
                      {formatGhs(request.payable.amount)}) to activate your
                      sessions.
                    </p>
                    <PayInstallmentButton
                      engagementId={request.payable.engagementId}
                      installmentId={request.payable.installmentId}
                      amountDisplay={formatGhs(request.payable.amount)}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-emerald-800">
                    Accepted.{" "}
                    {engagements.some((e) => e.tutorName === request.tutorName)
                      ? "This agreement is already paid or in progress — see My payments."
                      : "Your payment link will appear here once your agreement is set up."}
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
