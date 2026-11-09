import type { listAllPayouts, EngagementView } from "@/services/payments/queries";
import { isOverdue } from "@/lib/time";
import { promiseState, summarizePlans } from "@/services/payments/plan";

/**
 * Pure derivations shared by the admin console's Overview (money + student
 * payment tiles) and the Payments sub-tabs (payout queue, agreements). Kept
 * module-level for react-hooks/purity: the clock is snapshotted once here.
 */

type Payouts = Awaited<ReturnType<typeof listAllPayouts>>;

/** Flagged/pending payouts first, settled ones last. */
export function sortPayoutQueue(payouts: Payouts): Payouts {
  const rank: Record<string, number> = {
    pending_review: 0,
    approved: 1,
    transferring: 2,
    held: 3,
    paid: 4,
    failed: 5,
  };
  return [...payouts].sort((a, b) => rank[a.status] - rank[b.status]);
}

export const PAYOUT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending_review: { label: "Needs review", tone: "amber" },
  approved: { label: "Approved — send transfer", tone: "brand" },
  transferring: { label: "Transfer in flight", tone: "neutral" },
  paid: { label: "Paid", tone: "green" },
  held: { label: "On hold", tone: "red" },
  failed: { label: "Failed — retry allowed", tone: "red" },
};

export const ENGAGEMENT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending_payment: { label: "Awaiting first payment", tone: "amber" },
  active: { label: "Active", tone: "green" },
  completed: { label: "Completed", tone: "brand" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export function deriveAdminPayments(rows: {
  engagements: EngagementView[];
  payouts: Payouts;
}) {
  const now = Date.now();

  let collected = BigInt(0);
  let outstanding = BigInt(0);
  let revenue = BigInt(0);
  let overdueCount = 0;

  const engagements = rows.engagements.map((e) => {
    if (e.status !== "cancelled") {
      collected += e.paidPesewas;
      outstanding += e.remainingPesewas;
    }
    // Proportional revenue: fee-on-total scaled by what's actually paid.
    // Multiply BEFORE dividing — bigint division truncates.
    if (e.agreedTotal > BigInt(0)) {
      revenue += (e.platformFee * e.paidPesewas) / e.agreedTotal;
    }
    const hasOverdue = e.installments.some(
      (i) =>
        i.status === "overdue" ||
        (i.status === "pending" && isOverdue(new Date(i.dueAt), now)),
    );
    if (hasOverdue) overdueCount += 1;
    return {
      ...e,
      hasOverdue,
      // 0032 — is the agreed full-payment date still in the future?
      promise: promiseState(e.expectedFullPaymentAt, e.remainingPesewas, now),
    };
  });

  // Per STUDENT, not per agreement: "how many students have paid in full" is
  // a question about people. A student with two courses is one student, and is
  // only settled when both agreements are.
  const summary = summarizePlans(
    rows.engagements.map((e) => ({
      studentId: e.studentId,
      paidPesewas: e.paidPesewas,
      remainingPesewas: e.remainingPesewas,
      status: e.status,
    })),
  );

  const queue = sortPayoutQueue(rows.payouts);

  return {
    engagements,
    queue,
    summary,
    collected,
    outstanding,
    revenue,
    overdueCount,
    promisesOverdue: engagements.filter((e) => e.promise === "overdue").length,
    needsReview: queue.filter((p) => p.status === "pending_review").length,
    readyToSend: queue.filter((p) => p.status === "approved").length,
  };
}
