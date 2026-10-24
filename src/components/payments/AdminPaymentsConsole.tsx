import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  UserCheck,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listAllEngagements,
  listAllPayouts,
  listOpenRequestsForAdmin,
  listPaymentRequestsForAdmin,
  listPayoutAccountsForAdmin,
  type EngagementView,
  type OpenPlanRequestView,
  type PaymentRequestView,
} from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";
import { accraDate, isOverdue } from "@/lib/time";
import { promiseState, summarizePlans } from "@/services/payments/plan";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  listRecentPaymentsForAdmin,
  type PaymentLogRow,
} from "@/services/payments/queries";
import { AdminPayoutActions } from "./AdminPayoutActions";
import { AdminVerifyPayoutAccountButton } from "./AdminVerifyPayoutAccountButton";
import { CancelPaymentLinkButton } from "./CancelPaymentLinkButton";
import { CreatePaymentLinkForm } from "./CreatePaymentLinkForm";
import { OpenPlanForm } from "./OpenPlanForm";
import { PromiseDateForm } from "./PromiseDateForm";
import { RecordPartPaymentForm } from "./RecordPartPaymentForm";

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
 *      and overdue flags, plus the 0029 record-a-part-payment form for money
 *      that arrived outside Paystack, and the combined payment log (both
 *      channels, newest first).
 */

const PAYOUT_BADGE: Record<
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

  const queue = [...rows.payouts].sort((a, b) => {
    const rank: Record<string, number> = {
      pending_review: 0,
      approved: 1,
      transferring: 2,
      held: 3,
      paid: 4,
      failed: 5,
    };
    return rank[a.status] - rank[b.status];
  });

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

export async function AdminPaymentsConsole() {
  await requireRole("admin");

  const [engagements, payouts, accounts, paymentLog, openRequests, links] =
    await Promise.all([
      listAllEngagements(),
      listAllPayouts(),
      listPayoutAccountsForAdmin(),
      listRecentPaymentsForAdmin(),
      listOpenRequestsForAdmin(),
      listPaymentRequestsForAdmin(),
    ]);
  const d = derive({ engagements, payouts });

  const stats = [
    { label: "Collected", value: formatGhs(d.collected), icon: Wallet, tint: "bg-petrol-50 text-petrol-700" },
    { label: "Platform revenue", value: formatGhs(d.revenue), icon: Banknote, tint: "bg-brand-50 text-brand-700" },
    { label: "Outstanding", value: formatGhs(d.outstanding), icon: AlertTriangle, tint: "bg-amber-50 text-amber-700" },
    { label: "Needs review", value: String(d.needsReview), icon: Banknote, tint: "bg-red-50 text-red-700" },
  ];

  // 0032 — the student-side questions: how many students, how many settled,
  // how many still owe. Counted per person (summarizePlans), not per course.
  const studentStats = [
    {
      label: "Students",
      value: String(d.summary.students),
      icon: Users,
      tint: "bg-slate-100 text-slate-700",
    },
    {
      label: "Paid in full",
      value: String(d.summary.paidInFull),
      icon: UserCheck,
      tint: "bg-emerald-50 text-emerald-700",
    },
    {
      label: "Paying in parts",
      value: String(d.summary.partPaid),
      icon: CalendarClock,
      tint: "bg-amber-50 text-amber-700",
    },
    {
      label: "Not paid yet",
      value: String(d.summary.unpaid),
      icon: UserX,
      tint: "bg-red-50 text-red-700",
    },
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
            judgment. Sending the transfer puts the payout in flight — it
            finalizes (paid or failed) when Paystack confirms.
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

      {/* Students & plans (0032) — "how many students, how many paid in full,
          how many still owe" is the question the admin actually asks. Counted
          per student, so a student with two courses counts once. */}
      <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-900">
            Students &amp; payment plans
          </h3>
          {d.promisesOverdue > 0 && (
            <Badge tone="red">{d.promisesOverdue} promise overdue</Badge>
          )}
        </div>
        <div className="mt-4 grid gap-4 grid-cols-2 lg:grid-cols-4">
          {studentStats.map((stat) => (
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
                    <AdminPayoutActions
                      payoutId={payout.id}
                      status={payout.status}
                      amountDisplay={formatGhs(payout.amount)}
                    />
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Payout accounts — verify before tutors can request payouts (0015) */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900">Tutor payout accounts</h3>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          A tutor can only request a payout once their mobile money account is
          verified. Confirm the details (a small test ping transfer is the
          safest check), then verify.
        </p>
        {accounts.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No payout accounts saved yet — tutors add theirs on the Earnings
            page.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {accounts.map((account) => (
              <li key={account.tutorProfileId}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {account.tutorName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {account.provider.toUpperCase()} · {account.phone}
                      {account.accountName ? ` · ${account.accountName}` : ""}
                    </p>
                  </div>
                  <AdminVerifyPayoutAccountButton
                    tutorProfileId={account.tutorProfileId}
                    verified={account.verified}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Requests waiting for a plan (0032). A student who cannot pay the full
          fee reaches the admin from the paywall; until the admin opens a plan
          there is no agreement, so nothing can be recorded against them. */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900">
          Requests waiting for a plan
        </h3>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Students who sent a tutor request but have no payment agreement yet —
          usually because they asked for a payment plan. Open the plan, set the
          promised date, then send a part-payment link.
        </p>
        {openRequests.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            Nothing waiting — every live request already has an agreement.
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {openRequests.map((request: OpenPlanRequestView) => (
              <li key={request.requestId}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {request.studentName || "Student"} ×{" "}
                      {request.tutorName || "Tutor"} · {request.courseTitle}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {request.studentCode && (
                        <span className="mr-2 font-mono text-slate-400">
                          {request.studentCode}
                        </span>
                      )}
                      {request.sessionMode === "group"
                        ? "Group sessions"
                        : "One-on-one"}{" "}
                      · requested {accraDate(new Date(request.createdAt))}
                    </p>
                  </div>
                  <OpenPlanForm requestId={request.requestId} />
                </Card>
              </li>
            ))}
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
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-4">
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
                        {formatGhs(engagement.agreedTotal)} ·{" "}
                        {formatGhs(engagement.remainingPesewas)} left
                        {engagement.hasOverdue ? " · has overdue installment(s)" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {engagement.promise === "overdue" && (
                        <Badge tone="red">Promise overdue</Badge>
                      )}
                      {engagement.promise === "due" && (
                        <Badge tone="amber">Promised today</Badge>
                      )}
                      {engagement.hasOverdue && <Badge tone="red">Overdue</Badge>}
                      <Badge
                        tone={
                          ENGAGEMENT_BADGE[engagement.status]?.tone ?? "neutral"
                        }
                      >
                        {ENGAGEMENT_BADGE[engagement.status]?.label ?? engagement.status}
                      </Badge>
                    </div>
                  </div>

                  {(engagement.status === "active" ||
                    engagement.status === "pending_payment") && (
                    <div className="mt-4 grid gap-5 border-t border-slate-200 pt-4 lg:grid-cols-2">
                      <PromiseDateForm
                        engagementId={engagement.id}
                        currentDate={engagement.expectedFullPaymentAt}
                        overdue={engagement.promise === "overdue"}
                      />
                      <CreatePaymentLinkForm
                        engagementId={engagement.id}
                        remainingCedis={Number(engagement.remainingPesewas) / 100}
                      />
                      {/* 0029 — record money that arrived outside Paystack. */}
                      <div className="lg:col-span-2">
                        <RecordPartPaymentForm
                          engagementId={engagement.id}
                          remainingDisplay={`${formatGhs(engagement.remainingPesewas)} of ${formatGhs(engagement.agreedTotal)}`}
                        />
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Part-payment links (0032) — what was sent, and what is still open. */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900">
          Part-payment links
        </h3>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Every link issued, newest first. The link itself is not stored (only
          its hash), so a lost link has to be replaced — cancel the old one
          first.
        </p>
        {links.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No part-payment links yet.
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {links.map((link: PaymentRequestView) => (
              <li key={link.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatGhs(link.amount)} ·{" "}
                      {link.studentName || "Student"} ·{" "}
                      {link.courseTitle || "Course"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Issued {accraDate(new Date(link.createdAt))}
                      {link.expiresAt
                        ? ` · expires ${accraDate(new Date(link.expiresAt))}`
                        : ""}
                      {link.note ? ` · ${link.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        link.status === "paid"
                          ? "green"
                          : link.status === "cancelled"
                            ? "neutral"
                            : "amber"
                      }
                    >
                      {link.status === "paid"
                        ? "Paid"
                        : link.status === "cancelled"
                          ? "Cancelled"
                          : "Open"}
                    </Badge>
                    {link.status === "open" && (
                      <CancelPaymentLinkButton requestId={link.id} />
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Payment log — both channels in one ledger (0029) */}
      <div className="mt-10">
        <h3 className="text-lg font-semibold text-slate-900">Payment log</h3>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Paystack charges and payments you recorded out-of-band, newest
          first. Only webhook-verified (or admin-confirmed) money appears.
        </p>
        {paymentLog.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No payments yet.
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {paymentLog.map((payment: PaymentLogRow) => (
              <li key={payment.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatGhs(payment.amount)} ·{" "}
                      {payment.studentName || "Student"} ×{" "}
                      {payment.tutorName || "Tutor"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {payment.courseTitle || "Course"} ·{" "}
                      <span className="font-mono">{payment.reference}</span>
                      {payment.note ? ` · ${payment.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={payment.source === "admin" ? "amber" : "green"}>
                      {payment.source === "admin"
                        ? "Recorded by admin"
                        : "Paystack"}
                    </Badge>
                    <Badge
                      tone={payment.status === "paid" ? "green" : "neutral"}
                    >
                      {payment.status}
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
