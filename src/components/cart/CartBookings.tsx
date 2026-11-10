"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock } from "lucide-react";
import { cancelBooking } from "@/services/payments/mutations";
import { formatGhs } from "@/lib/money";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PayBookingsButton, type PayableBooking } from "@/components/payments/PayBookingsModal";

export type PaidBooking = {
  id: string;
  courseLabel: string;
  tutorName: string;
  detail: string;
  amountPesewas: string;
  status: "active" | "completed";
};

/** Two-step cancel: "Cancel" → "Cancel booking?" Yes / No. */
function CancelButton({ id, onDone }: { id: string; onDone: (msg: { error?: string; message?: string }) => void }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const btn = "inline-flex h-9 items-center rounded-md px-3 text-xs font-semibold transition disabled:opacity-60";

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={`${btn} border border-slate-300 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
      >
        Cancel
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await cancelBooking(id);
            setArmed(false);
            onDone(result);
            router.refresh();
          })
        }
        className={`${btn} bg-red-600 text-white hover:bg-red-700`}
      >
        {pending ? "Cancelling…" : "Cancel booking"}
      </button>
      <button type="button" disabled={pending} onClick={() => setArmed(false)} className={`${btn} border border-slate-300 bg-white text-slate-600 hover:bg-slate-50`}>
        Keep
      </button>
    </span>
  );
}

/**
 * The cart's booking sections (signed-in students): bookings made but not
 * paid yet — each with Pay (opens the payment modal, where a discount code
 * can be applied) and Cancel — and a short list of paid bookings.
 */
export function CartBookings({
  pending,
  paid,
}: {
  pending: PayableBooking[];
  paid: PaidBooking[];
}) {
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  if (pending.length === 0 && paid.length === 0) return null;

  return (
    <div className="space-y-8">
      {result && (result.error || result.message) && (
        <p
          role="status"
          className={
            result.error
              ? "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          }
        >
          {result.error ?? result.message}
        </p>
      )}

      {pending.length > 0 && (
        <section aria-label="Booked, awaiting payment">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
              <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Booked — awaiting payment ({pending.length})
            </h2>
            {pending.length > 1 && <PayBookingsButton bookings={pending} label={`Pay all (${pending.length})`} />}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            These bookings are waiting for payment. Your sessions are confirmed once they&apos;re paid.
          </p>
          <Card padded={false} className="mt-3 divide-y divide-slate-100 overflow-hidden">
            {pending.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{b.courseLabel}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    with {b.tutorName} · {b.detail} · {formatGhs(BigInt(b.owedPesewas))}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PayBookingsButton bookings={[b]} label="Pay" className="h-9 px-3 text-xs" />
                  <CancelButton id={b.id} onDone={setResult} />
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {paid.length > 0 && (
        <section aria-label="Paid bookings">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Paid
            </h2>
            <Link href="/dashboard/payments" className="text-sm font-medium text-brand-700 hover:underline">
              See all payments
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
            {paid.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{b.courseLabel}</span>
                  <span className="text-slate-500"> · with {b.tutorName} · {b.detail}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-slate-700">{formatGhs(BigInt(b.amountPesewas))}</span>
                  <Badge tone={b.status === "completed" ? "brand" : "green"}>
                    {b.status === "completed" ? "Completed" : "Paid"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
