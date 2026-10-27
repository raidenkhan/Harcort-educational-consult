import Link from "next/link";
import { ArrowRight, Receipt } from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listTutorPayments,
  type TutorPaymentView,
} from "@/services/payments/queries";
import { formatGhs } from "@/lib/money";
import { accraDate } from "@/lib/time";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * "Recent payments" — the table a tutor actually wants on their dashboard.
 *
 * Earnings (`/tutor/earnings`) answers "how much is left / what can I pay
 * out"; this answers "who paid me, for which course, how much, and when".
 * It sits on the dashboard because a payment now confirms the booking by
 * itself — the tutor should see the money without opening another tab and
 * without wondering whether they need to approve something.
 *
 * The table is presentational (`TutorPaymentsTable`) so the dashboard can
 * render the rows from its one aggregate read; `TutorPaymentsCard` is the
 * self-fetching wrapper the earnings page uses.
 */

const STATUS: Record<
  string,
  { label: string; tone: "green" | "amber" | "red" | "neutral" }
> = {
  paid: { label: "Paid", tone: "green" },
  initialized: { label: "Confirming", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
  abandoned: { label: "Abandoned", tone: "neutral" },
};

export function TutorPaymentsTable({
  payments,
  linkToEarnings = true,
}: {
  payments: TutorPaymentView[];
  linkToEarnings?: boolean;
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Payments
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-slate-900">
            Recent payments
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Students pay the semester fee up front. A payment confirms the
            booking automatically — there is nothing for you to approve.
          </p>
        </div>
        {linkToEarnings && (
          <Link
            href="/tutor/earnings"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 hover:text-brand-800"
          >
            Earnings &amp; payouts
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {payments.length === 0 ? (
        <div className="px-6 py-6 text-center text-sm text-slate-500 sm:py-10">
          <Receipt className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3">
            No payments yet. When a student pays for one of your courses it
            appears here — with their name, the course and the amount.
          </p>
        </div>
      ) : (
        <>
          {/* Phones: a stacked list. The table's five columns cannot fit 320px
              without sideways scrolling, which hides the amount and status —
              the two things the tutor came to see. */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            {payments.map((payment) => {
              const badge = STATUS[payment.status] ?? {
                label: payment.status,
                tone: "neutral" as const,
              };
              return (
                <li
                  key={payment.id}
                  className="flex items-start justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {payment.studentName || "Student"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {payment.courseTitle || "—"}
                      {payment.studentCode ? ` · ${payment.studentCode}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {accraDate(new Date(payment.paidAt ?? payment.createdAt))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-slate-900">
                      {formatGhs(payment.amount)}
                    </p>
                    <p className="mt-1">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                  Student
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Course
                </th>
                <th scope="col" className="px-3 py-3 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Date
                </th>
                <th
                  scope="col"
                  className="px-5 py-3 text-right font-semibold sm:px-6"
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((payment) => {
                const badge = STATUS[payment.status] ?? {
                  label: payment.status,
                  tone: "neutral" as const,
                };
                return (
                  <tr key={payment.id} className="align-top">
                    <td className="px-5 py-3.5 sm:px-6">
                      <p className="font-medium text-slate-900">
                        {payment.studentName || "Student"}
                      </p>
                      {payment.studentCode && (
                        <p className="mt-0.5 font-mono text-xs text-slate-500">
                          {payment.studentCode}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-slate-700">
                      {payment.courseTitle || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-right font-semibold tabular-nums text-slate-900">
                      {formatGhs(payment.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-slate-500">
                      {accraDate(new Date(payment.paidAt ?? payment.createdAt))}
                    </td>
                    <td className="px-5 py-3.5 text-right sm:px-6">
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}
    </Card>
  );
}

export async function TutorPaymentsCard({
  /** How many rows to show. The earnings tab keeps the longer history. */
  limit = 25,
  /** The "Earnings & payouts" shortcut is pointless when this card is already
   *  on the earnings page. */
  linkToEarnings = true,
}: {
  limit?: number;
  linkToEarnings?: boolean;
} = {}) {
  const profile = await requireRole("tutor");
  const payments = await listTutorPayments(profile, limit);

  return (
    <TutorPaymentsTable payments={payments} linkToEarnings={linkToEarnings} />
  );
}
