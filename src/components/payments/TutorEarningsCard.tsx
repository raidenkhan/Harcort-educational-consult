import { requireRole } from "@/services/auth/queries";
import {
  getPayoutAccount,
  listTutorEngagements,
  listTutorPayouts,
} from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";
import { dueDateLabel, isOverdue } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PayoutAccountForm } from "./PayoutAccountForm";
import { RequestPayoutButton } from "./RequestPayoutButton";

/**
 * Tutor earnings card — the money side of the tutor page.
 *
 * Three blocks:
 *   1. Summary tiles — lifetime collected (what students actually paid),
 *      pending (unpaid installments), expected share (90% of collected).
 *   2. Engagement rows — per-student payment progress with installment
 *      detail and the payout request button.
 *   3. MoMo payout account setup (PayoutAccountForm).
 *
 * All money math is derived in queries.ts from DB rows; this component only
 * formats. The payout request button's guards (every pesewa paid + every
 * session dual-ticked) live in the DB — see migration 0011.
 */

const PAYOUT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending_review: { label: "In review", tone: "amber" },
  approved: { label: "Approved — transfer pending", tone: "brand" },
  paid: { label: "Paid", tone: "green" },
  held: { label: "On hold", tone: "red" },
  failed: { label: "Failed — retrying", tone: "red" },
};

/** Module-level (react-hooks/purity): snapshot the clock once. */
function withDerived(engagements: Awaited<ReturnType<typeof listTutorEngagements>>) {
  const now = Date.now();
  let collected = BigInt(0);
  let outstanding = BigInt(0);
  const rows = engagements.map((e) => {
    collected += e.paidPesewas;
    if (e.status !== "cancelled") outstanding += e.remainingPesewas;
    return {
      ...e,
      installments: e.installments.map((i) => ({
        ...i,
        displayStatus:
          i.status === "pending" && isOverdue(new Date(i.dueAt), now)
            ? ("overdue" as const)
            : i.status,
      })),
    };
  });
  return { rows, collected, outstanding };
}

export async function TutorEarningsCard() {
  const profile = await requireRole("tutor");

  const engagements = await listTutorEngagements(profile);
  const payouts = await listTutorPayouts(profile);
  const account = await getPayoutAccount(profile);
  const { rows, collected, outstanding } = withDerived(engagements);
  const fee = collected / BigInt(10); // 10% platform fee on what's collected
  const share = collected - fee;

  return (
    <section aria-label="Earnings and payouts" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Earnings
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
            What you&apos;ve earned
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Students pay Harcourt in two installments; after sessions are
            confirmed, 90% is paid out to your mobile money account.
          </p>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Collected
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900">
            {formatGhs(collected)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Your share {formatGhs(share)} · platform {formatGhs(fee)}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Awaiting payment
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900">
            {formatGhs(outstanding)}
          </p>
          <p className="mt-1 text-xs text-slate-500">from open agreements</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Payouts sent
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-slate-900">
            {formatGhs(
              payouts
                .filter((p) => p.status === "paid")
                .reduce<bigint>((acc, p) => acc + p.amount, BigInt(0)),
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {payouts.filter((p) => p.status === "paid").length} completed payout
            {payouts.filter((p) => p.status === "paid").length === 1 ? "" : "s"}
          </p>
        </Card>
      </div>

      {/* Engagement rows */}
      <div className="space-y-4">
        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No payment agreements yet — earnings appear once a student commits
            to your quoted course price.
          </div>
        )}
        {rows.map((engagement) => {
          const payable = engagement.status === "active" || engagement.status === "completed";
          return (
            <Card key={engagement.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {engagement.courseTitle || "Course"}
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {engagement.studentName || "Student"} ·{" "}
                    {formatGhs(engagement.agreedTotal)} total · your share{" "}
                    {formatGhs(engagement.tutorShare)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      engagement.status === "active"
                        ? "green"
                        : engagement.status === "completed"
                          ? "brand"
                          : engagement.status === "cancelled"
                            ? "red"
                            : "amber"
                    }
                  >
                    {engagement.status === "pending_payment"
                      ? "Awaiting first payment"
                      : engagement.status === "active"
                        ? "Active"
                        : engagement.status === "completed"
                          ? "Completed"
                          : "Cancelled"}
                  </Badge>
                  {payable && <RequestPayoutButton engagementId={engagement.id} />}
                </div>
              </div>

              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {engagement.installments.map((installment) => (
                  <li
                    key={installment.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm"
                  >
                    <span className="text-slate-700">
                      Installment {installment.idx} · {formatGhs(installment.amount)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        {installment.paidAt
                          ? `Paid ${dueDateLabel(new Date(installment.paidAt))}`
                          : dueDateLabel(new Date(installment.dueAt))}
                      </span>
                      <Badge
                        tone={
                          installment.displayStatus === "paid"
                            ? "green"
                            : installment.displayStatus === "overdue"
                              ? "red"
                              : "neutral"
                        }
                      >
                        {installment.displayStatus === "paid"
                          ? "Paid"
                          : installment.displayStatus === "overdue"
                            ? "Overdue"
                            : "Pending"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {/* Payout account setup */}
      <PayoutAccountForm account={account} />

      {/* Payout history */}
      {payouts.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-slate-900">Payout history</h3>
          <ul className="mt-3 divide-y divide-slate-100">
            {payouts.map((payout) => {
              const badge = PAYOUT_BADGE[payout.status] ?? {
                label: payout.status,
                tone: "neutral" as const,
              };
              return (
                <li
                  key={payout.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="text-slate-700">
                    {payout.courseTitle || "Engagement"} ·{" "}
                    {payout.studentName || "Student"}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {formatGhs(payout.amount)}
                    </span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
