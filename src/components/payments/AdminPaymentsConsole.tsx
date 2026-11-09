import { CalendarClock } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listAllEngagements,
  listAllPayouts,
  listOpenRequestsForAdmin,
  listPaymentRequestsForAdmin,
  listPayoutAccountsForAdmin,
  listRecentPaymentsForAdmin,
  type OpenPlanRequestView,
  type PaymentLogRow,
  type PaymentRequestView,
} from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";
import { accraDate } from "@/lib/time";
import {
  agreementGroupLabel,
  groupAgreementsByStudent,
  listPayers,
} from "@/services/payments/plan";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  ENGAGEMENT_BADGE,
  PAYOUT_BADGE,
  deriveAdminPayments,
  sortPayoutQueue,
} from "./adminPayments";
import { AdminAgreementsByStudent } from "./AdminAgreementsByStudent";
import { AdminPayoutActions } from "./AdminPayoutActions";
import { AdminVerifyPayoutAccountButton } from "./AdminVerifyPayoutAccountButton";
import { CancelPaymentLinkButton } from "./CancelPaymentLinkButton";
import { CreateInstallmentPlanForm } from "./CreateInstallmentPlanForm";
import { CreatePaymentLinkForm } from "./CreatePaymentLinkForm";
import { OpenPlanForm } from "./OpenPlanForm";
import { PromiseDateForm } from "./PromiseDateForm";
import { RecordPartPaymentForm } from "./RecordPartPaymentForm";

/**
 * Admin payments console, split into the Payments sub-tabs. It used to be ONE
 * page with eight stacked sections (stat tiles, payout queue, payout accounts,
 * plan tiles, plan requests, agreements, links, log). The stat tiles now live
 * on the console Overview; each sub-tab below is its own route and fetches
 * only what it shows:
 *
 *   /admin/payments             → AdminPaidTab         (every student who has paid)
 *   /admin/payments/payouts     → AdminPayoutsTab      (queue + payout accounts)
 *   /admin/payments/plans       → AdminPlanRequestsTab (requests waiting for a plan)
 *   /admin/payments/agreements  → AdminAgreementsTab   (per-student agreements)
 *   /admin/payments/links       → AdminPaymentLinksTab (part-payment links)
 *   /admin/payments/log         → AdminPaymentLogTab   (every charge)
 */

export async function AdminPayoutsTab() {
  await requireRole("admin");
  const [payouts, accounts] = await Promise.all([
    listAllPayouts(),
    listPayoutAccountsForAdmin(),
  ]);
  const queue = sortPayoutQueue(payouts);

  return (
    <div>
      {/* Payout queue */}
      <div className="mt-10 first:mt-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">Payout queue</h2>
        {queue.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No payouts yet — they appear when a tutor requests one after
            completing their sessions.
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {queue.map((payout) => {
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
      <div className="mt-10 first:mt-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">Tutor payout accounts</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
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

    </div>
  );
}

export async function AdminPaidTab() {
  await requireRole("admin");
  const payers = listPayers(await listAllEngagements());
  const paidInFull = payers.filter((p) => p.state === "paid").length;
  const total = payers.reduce((sum, p) => sum + p.paidPesewas, BigInt(0));

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
            Students who have paid
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Everyone with money on an agreement, Paystack or recorded by an
            admin. One row per student; their courses are listed under them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="brand">{payers.length} paid</Badge>
          <Badge tone="green">{paidInFull} in full</Badge>
          <Badge tone="neutral">{formatGhs(total)} collected</Badge>
        </div>
      </div>

      {payers.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
          No payments yet. Students appear here as soon as any money lands on
          one of their agreements.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {payers.map((payer) => (
            <li key={payer.studentId}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {payer.studentName || "Student"}
                      {payer.studentCode && (
                        <span className="ml-2 font-mono text-xs font-normal text-slate-400">
                          {payer.studentCode}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatGhs(payer.paidPesewas)} paid of{" "}
                      {formatGhs(payer.agreedTotal)}
                      {payer.remainingPesewas > BigInt(0) &&
                        ` · ${formatGhs(payer.remainingPesewas)} left`}
                    </p>
                  </div>
                  <Badge tone={payer.state === "paid" ? "green" : "amber"}>
                    {payer.state === "paid" ? "Paid in full" : "Paying in parts"}
                  </Badge>
                </div>
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                  {payer.courses.map((course) => (
                    <li
                      key={course.engagementId}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="min-w-0 text-slate-700">
                        {course.courseTitle || "Course"}
                        <span className="text-slate-400"> · with {course.tutorName || "Tutor"}</span>
                      </span>
                      <span className="font-medium tabular-nums text-slate-900">
                        {formatGhs(course.paidPesewas)}
                        <span className="font-normal text-slate-400">
                          {" "}/ {formatGhs(course.agreedTotal)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function AdminPlanRequestsTab() {
  await requireRole("admin");
  const openRequests = await listOpenRequestsForAdmin();

  return (
    <div>
      {/* Requests waiting for a plan (0032). A student who cannot pay the full
          fee reaches the admin from the paywall; until the admin opens a plan
          there is no agreement, so nothing can be recorded against them. */}
      <div className="mt-10 first:mt-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Requests waiting for a plan
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
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

    </div>
  );
}

export async function AdminAgreementsTab() {
  await requireRole("admin");
  const rawEngagements = await listAllEngagements();
  // Only the per-agreement flags (overdue, promise state) are used here, so
  // the payout list the derivation also accepts is left empty.
  const { engagements } = deriveAdminPayments({
    engagements: rawEngagements,
    payouts: [],
  });
  // One student at a time: the picker's options (labels + order), while the
  // cards stay server-rendered and filter themselves by `data-student`.
  const agreementGroups = groupAgreementsByStudent(engagements);

  return (
    <div>
      {/* Engagements oversight — ONE student at a time (user report: the old
          list stacked every student's agreements into one endless scroll). */}
      <div className="mt-10 first:mt-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Payment agreements
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          One student at a time — pick a student to see their agreements,
          plans and record-a-payment forms.
        </p>
        {engagements.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
            No agreements yet — when students commit to a quoted course, every
            agreement and its installment progress shows here.
          </div>
        ) : (
          <AdminAgreementsByStudent
            students={agreementGroups.map((group) => ({
              id: group.studentId,
              label: agreementGroupLabel(group),
            }))}
          >
            {engagements.map((engagement) => (
              <li
                key={engagement.id}
                data-student={engagement.studentId}
              >
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
                      {engagement.installments.length === 0 && (
                        <Badge tone="neutral">One-off</Badge>
                      )}
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
                      {/* 0039 — the schedule, once the admin has created one. */}
                      {engagement.installments.length > 0 && (
                        <div className="lg:col-span-2">
                          <p className="text-xs font-semibold text-slate-700">
                            <CalendarClock className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-slate-400" />
                            Installment plan ·{" "}
                            {engagement.installments.length} part
                            {engagement.installments.length === 1 ? "" : "s"}
                          </p>
                          <ul className="mt-1.5 flex flex-wrap gap-2">
                            {engagement.installments.map((part) => (
                              <li
                                key={part.id}
                                className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs"
                              >
                                <span className="font-semibold text-slate-900">
                                  {formatGhs(part.amount)}
                                </span>
                                <span className="text-slate-500">
                                  by {accraDate(new Date(part.dueAt))}
                                </span>
                                <Badge
                                  tone={
                                    part.status === "paid"
                                      ? "green"
                                      : part.status === "overdue"
                                        ? "red"
                                        : "amber"
                                  }
                                >
                                  {part.status === "paid"
                                    ? "Paid"
                                    : part.status === "overdue"
                                      ? "Overdue"
                                      : part.status === "waived"
                                        ? "Waived"
                                        : "Due"}
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 0039 — one-off default: nothing paid and no schedule
                          yet, so the agreement may still be split. Once any
                          money lands the RPC refuses (payments_already_started)
                          and this form simply disappears. */}
                      {engagement.status === "pending_payment" &&
                        engagement.paidPesewas === BigInt(0) &&
                        engagement.installments.length === 0 && (
                          <div className="lg:col-span-2">
                            <CreateInstallmentPlanForm
                              engagementId={engagement.id}
                              totalPesewas={engagement.agreedTotal.toString()}
                              totalDisplay={formatGhs(engagement.agreedTotal)}
                            />
                          </div>
                        )}

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
          </AdminAgreementsByStudent>
        )}
      </div>

    </div>
  );
}

export async function AdminPaymentLinksTab() {
  await requireRole("admin");
  const links = await listPaymentRequestsForAdmin();

  return (
    <div>
      {/* Part-payment links (0032) — what was sent, and what is still open. */}
      <div className="mt-10 first:mt-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Part-payment links
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
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

    </div>
  );
}

export async function AdminPaymentLogTab() {
  await requireRole("admin");
  const paymentLog = await listRecentPaymentsForAdmin();

  return (
    <div>
      {/* Payment log — both channels in one ledger (0029) */}
      <div className="mt-10 first:mt-0">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">Payment log</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
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
    </div>
  );
}
