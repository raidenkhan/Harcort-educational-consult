import { AlertTriangle, Banknote, Wallet } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listAllEngagements,
  listAllPayouts,
  type EngagementView,
} from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";
import { isOverdue } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AdminPayoutActions } from "./AdminPayoutActions";

/**
 * Admin payments console — the money oversight half of the admin page.
 *
 * Sections:
 *   1. Stat tiles — collected platform-wide, platform revenue (10%),
 *      outstanding student debt, payouts queued for review.
 *   2. Payout queue — every payout, flagged/pending first; approve, send
 *      the MoMo transfer, or hold with a mandatory reason. Every action
 *      lands in payment_events + the tutors are emailed by the outbox.
 *   3. Engagements oversight — all agreements with installment progress
 *      and overdue flags, so the admin can see a struggling student before
 *      a payout request ever arrives.
 */

const PAYOUT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending_review: { label: "Needs review", tone: "amber" },
  approved: { label: "Approved — send transfer", tone: "brand" },
  paid: { label: "Paid", tone: "green" },
  held: { label: "On hold", tone: "red" },
  failed: { label: "Failed", tone: "red" },
};

const ENGAGEMENT_BADGE: Record<
  string,
  { label: string; tone: "amber" | "green" | "red" | "neutral" | "brand" }
> = {
  pending_payment: { label: "Awaiting first payment", tone: "amber" },
  active: { label: "Active", tone: "green" },
  completed: { label: "Completed", tone: "brand" },
  cancelled: { label: "Cancelled", tone: "red" },
};

/** Module-level derivation (react-hooks/purity) — snapshot the clock once. */
function derive(rows: {
  engagements: EngagementView[];
  payouts: Awaited<ReturnType<typeof listAllPayouts>>;
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
    return { ...e, hasOverdue };
  });

  const queue = [...rows.payouts].sort((a, b) => {
    const rank: Record<string, number> = {
      pending_review: 0,
      approved: 1,
      held: 2,
      paid: 3,
      failed: 4,
    };
    return rank[a.status] - rank[b.status];
  });

  return {
    engagements,
    queue,
    collected,
    outstanding,
    revenue,
    overdueCount,
    needsReview: queue.filter((p) => p.status === "pending_review").length,
    readyToSend: queue.filter((p) => p.status === "approved").length,
  };
}

export async function AdminPaymentsConsole() {
  await requireRole("admin");

  const [engagements, payouts] = await Promise.all([
    listAllEngagements(),
    listAllPayouts(),
  ]);
  const d = derive({ engagements, payouts });

  const stats = [
    { label: "Collected", value: formatGhs(d.collected), icon: Wallet, tint: "bg-petrol-50 text-petrol-700" },
    { label: "Platform revenue", value: formatGhs(d.revenue), icon: Banknote, tint: "bg-brand-50 text-brand-700" },
    { label: "Outstanding", value: formatGhs(d.outstanding), icon: AlertTriangle, tint: "bg-amber-50 text-amber-700" },
    { label: "Needs review", value: String(d.needsReview), icon: Banknote, tint: "bg-red-50 text-red-700" },
  ];

  return (
    <section aria-label="Payments" className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
            Payments
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-slate-900">
            Payout queue &amp; agreements
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Clean completions auto-approve; flagged ones wait here for your
            judgment. Sending the transfer marks the payout paid and notifies
            the tutor.
          </p>
        </div>
        <div className="flex gap-2">
          {d.needsReview > 0 && <Badge tone="amber">{d.needsReview} need review</Badge>}
          {d.readyToSend > 0 && <Badge tone="brand">{d.readyToSend} ready to send</Badge>}
          {d.overdueCount > 0 && <Badge tone="red">{d.overdueCount} overdue</Badge>}
        </div>
      </div>

      {/* Stat tiles */}
      <div className="mt-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="flex items-center gap-4">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md ${stat.tint}`}>
              <stat.icon className="h-5 w-5" />
  </span>
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="truncate text-xs font-medium text-slate-500">{stat.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Payout queue */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900">Payout queue</h3>
        {d.queue.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No payouts yet — they appear when a tutor requests one after
            completing their sessions.
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {d.queue.map((payout) => {
              const badge = PAYOUT_BADGE[payout.status] ?? {
                label: payout.status,
                tone: "neutral" as const,
              };
              return (
                <li key={payout.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-6">
                    <div className="min-w-0 max-w-xl flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-900">
                          {payout.tutorName || "Tutor"} → {payout.studentName || "Student"}
                        </h4>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {payout.courseTitle || "Engagement"} ·{" "}
                        {formatGhs(payout.amount)} to tutor · platform keeps{" "}
                        {formatGhs(payout.platformFee)}
                        {payout.studentCode && (
                          <span className="ml-2 font-mono text-xs text-slate-400">
                            {payout.studentCode}
                          </span>
                        )}
                      </p>
                      {payout.flagReason && (
                        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          Flags: {payout.flagReason}
                        </p>
                      )}
                    </div>
                    <AdminPayoutActions payoutId={payout.id} status={payout.status} />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Engagements oversight */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900">
          Payment agreements
        </h3>
        {d.engagements.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No agreements yet — when students commit to a quoted course, every
            agreement and its installment progress shows here.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {d.engagements.map((engagement) => (
              <li key={engagement.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {engagement.studentName || "Student"} ×{" "}
                      {engagement.tutorName || "Tutor"} ·{" "}
                      {engagement.courseTitle || "Course"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {engagement.studentCode && (
                        <span className="mr-2 font-mono text-slate-400">
                          {engagement.studentCode}
                        </span>
                      )}
                      {formatGhs(engagement.paidPesewas)} paid of{" "}
                      {formatGhs(engagement.agreedTotal)}
                      {engagement.hasOverdue ? " · has overdue installment(s)" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {engagement.hasOverdue && <Badge tone="red">Overdue</Badge>}
                    <Badge
                      tone={
                        ENGAGEMENT_BADGE[engagement.status]?.tone ?? "neutral"
                      }
                    >
                      {ENGAGEMENT_BADGE[engagement.status]?.label ?? engagement.status}
                    </Badge>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
