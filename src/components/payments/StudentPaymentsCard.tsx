import { requireProfile } from "@/services/auth/queries";
import { listStudentEngagements } from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";
import { dueDateLabel, isOverdue } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PayInstallmentButton } from "./PayInstallmentButton";

/**
 * Student payments card — the money side of the student dashboard.
 *
 * One row per engagement: course, tutor, the 50/50 installment plan with
 * Accra-time due dates, and a pay button on every payable installment.
 * All amounts are pesewas formatted via formatGhs; no money math happens
 * here (queries.ts derives paid/remaining from the DB rows).
 */

const ENGAGEMENT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending_payment: { label: "Awaiting first payment", tone: "amber" },
  active: { label: "Active", tone: "green" },
  completed: { label: "Completed", tone: "brand" },
  cancelled: { label: "Cancelled", tone: "red" },
};

const INSTALLMENT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" }
> = {
  pending: { label: "Pending", tone: "neutral" },
  paid: { label: "Paid", tone: "green" },
  overdue: { label: "Overdue", tone: "red" },
  waived: { label: "Waived", tone: "neutral" },
};

/** Module-level so component render stays pure (react-hooks/purity) —
 *  same pattern as splitStudentTimetable on the dashboard page. Resolves
 *  pending installments past their Accra-day deadline to "overdue". */
function withDisplayStatus(engagements: Awaited<ReturnType<typeof listStudentEngagements>>) {
  const now = Date.now();
  return engagements.map((engagement) => ({
    ...engagement,
    installments: engagement.installments.map((installment) => ({
      ...installment,
      displayStatus:
        installment.status === "pending" && isOverdue(new Date(installment.dueAt), now)
          ? "overdue"
          : installment.status,
    })),
  }));
}

export async function StudentPaymentsCard() {
  const profile = await requireProfile();
  const engagements = await listStudentEngagements(profile);

  if (engagements.length === 0) {
    return (
      <Card className="border-dashed">
        <h2 className="text-lg font-semibold text-slate-900">My payments</h2>
        <p className="mt-1 text-sm text-slate-600">
          When you commit to a tutor&apos;s quoted course, your 50/50 payment
          plan appears here with deadlines and a pay button.
        </p>
      </Card>
    );
  }

  const renderable = withDisplayStatus(engagements);

  return (
    <section aria-label="My payments" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">My payments</h2>
        <span className="text-sm text-slate-500">
          {engagements.length} agreement{engagements.length === 1 ? "" : "s"}
        </span>
      </div>

      {renderable.map((engagement) => {
        const badge = ENGAGEMENT_BADGE[engagement.status] ?? {
          label: engagement.status,
          tone: "neutral" as const,
        };
        return (
          <Card key={engagement.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">
                  {engagement.courseTitle || "Course"}
                </h3>
                <p className="mt-0.5 text-sm text-slate-600">
                  with {engagement.tutorName || "your tutor"} ·{" "}
                  {formatGhs(engagement.agreedTotal)} total
                </p>
              </div>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </div>

            <div className="mt-2 text-sm text-slate-600">
              Paid {formatGhs(engagement.paidPesewas)} of{" "}
              {formatGhs(engagement.agreedTotal)}
              {engagement.remainingPesewas > BigInt(0) && (
                <> · {formatGhs(engagement.remainingPesewas)} remaining</>
              )}
            </div>

            <ul className="mt-4 space-y-3">
              {engagement.installments.map((installment) => {
                const displayStatus = installment.displayStatus;
                const badge2 = INSTALLMENT_BADGE[displayStatus] ?? {
                  label: displayStatus,
                  tone: "neutral" as const,
                };
                const payable = displayStatus === "pending" || displayStatus === "overdue";
                return (
                  <li
                    key={installment.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Installment {installment.idx} of 2 ·{" "}
                        {formatGhs(installment.amount)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {installment.paidAt
                          ? `Paid ${dueDateLabel(new Date(installment.paidAt))}`
                          : dueDateLabel(new Date(installment.dueAt))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={badge2.tone}>{badge2.label}</Badge>
                      {payable && engagement.status !== "cancelled" ? (
                        <PayInstallmentButton
                          engagementId={engagement.id}
                          installmentId={installment.id}
                          amountDisplay={formatGhs(installment.amount)}
                        />
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </section>
  );
}
