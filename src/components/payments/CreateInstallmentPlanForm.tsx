"use client";

import { useActionState, useState } from "react";
import { CalendarRange, Minus, Plus } from "lucide-react";
import {
  createInstallmentPlan,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Fields";

/**
 * Admin splits an agreement into installments (0039). Only offered on a
 * PENDING engagement that has not received a single pesewa — the RPC refuses
 * (`payments_already_started`) once any payment exists, because renegotiating
 * a plan mid-payment is how a ledger drifts.
 *
 * Amounts are typed in cedis; the action converts to pesewas server-side and
 * the RPC re-checks that the parts sum to the agreed total. The client keeps
 * that sum visible while editing (a live "of GH₵Y" line) so the admin finds a
 * mismatch here rather than from a rejected submit.
 */

/** Pesewas an entered cedis string is worth. Bad input counts as 0 — the sum
 *  line then shows a mismatch and submit stays disabled. */
function cedisToPesewas(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** An equal split of the total that always sums EXACTLY: the last part
 *  absorbs the pesewa remainder (GH₵100 in 3 → 33.33 / 33.33 / 33.34). */
function splitEvenly(totalPesewas: number, parts: number): string[] {
  if (!Number.isFinite(totalPesewas) || totalPesewas <= 0 || parts <= 0) {
    return [];
  }
  const base = Math.floor(totalPesewas / parts);
  const remainder = totalPesewas - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    ((base + (i === parts - 1 ? remainder : 0)) / 100).toFixed(2),
  );
}

const MAX_PARTS = 6;

export function CreateInstallmentPlanForm({
  engagementId,
  totalPesewas,
  totalDisplay,
}: {
  engagementId: string;
  /** Agreed total as a plain string of pesewas (bigint never crosses the
   *  server→client boundary). */
  totalPesewas: string;
  /** Pre-formatted "GH₵600" for the header. */
  totalDisplay: string;
}) {
  const total = Number.parseFloat(totalPesewas);
  const [parts, setParts] = useState(2);
  const [amounts, setAmounts] = useState<string[]>(() => splitEvenly(total, 2));
  const [dueDates, setDueDates] = useState<string[]>(() => ["", ""]);

  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    createInstallmentPlan,
    {},
  );

  /** Growing/shrinking re-prefills an even split and keeps the dates aligned
   *  with the rows (existing dates survive a grow). */
  function changeParts(next: number) {
    const clamped = Math.min(MAX_PARTS, Math.max(2, next));
    setParts(clamped);
    setAmounts(splitEvenly(total, clamped));
    setDueDates((prev) => Array.from({ length: clamped }, (_, i) => prev[i] ?? ""));
  }

  const sum = amounts.reduce((acc, a) => acc + cedisToPesewas(a), 0);
  const balanced = amounts.length > 0 && sum === total;
  const datesComplete =
    amounts.length > 0 && dueDates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const canSubmit = balanced && datesComplete && !pending;

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="engagementId" value={engagementId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-700">
          <CalendarRange className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-slate-400" />
          Split into installments{" "}
          <span className="font-normal text-slate-400">total {totalDisplay}</span>
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => changeParts(parts - 1)}
            disabled={parts <= 2}
            aria-label="One part fewer"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span
            className="min-w-14 text-center text-sm font-semibold text-slate-900"
            aria-live="polite"
          >
            {parts} parts
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => changeParts(parts + 1)}
            disabled={parts >= MAX_PARTS}
            aria-label="One part more"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ul className="mt-2 space-y-2">
        {amounts.map((amount, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-slate-500">
              Part {i + 1}
            </span>
            <Input
              name="amountCedis"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={amount}
              onChange={(e) =>
                setAmounts((prev) =>
                  prev.map((a, j) => (j === i ? e.target.value : a)),
                )
              }
              aria-label={`Amount for part ${i + 1} in cedis`}
              className="w-32 shrink-0"
            />
            <Input
              name="dueDate"
              type="date"
              required
              value={dueDates[i] ?? ""}
              onChange={(e) =>
                setDueDates((prev) =>
                  prev.map((d, j) => (j === i ? e.target.value : d)),
                )
              }
              aria-label={`Due date for part ${i + 1}`}
              className="min-w-0 flex-1"
            />
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p
          className={`text-xs font-medium ${balanced ? "text-slate-500" : "text-red-600"}`}
          role="status"
        >
          {balanced
            ? `Parts add up to ${totalDisplay}.`
            : `Parts add up to GH₵${(sum / 100).toFixed(2)} of ${totalDisplay}.`}
        </p>
        <Button
          type="submit"
          variant="secondary"
          disabled={!canSubmit}
          className="shrink-0"
        >
          {pending ? "Creating…" : "Create plan"}
        </Button>
      </div>

      {state?.error && (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="mt-1.5 text-xs font-medium text-emerald-700" role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
