"use client";

import { useState, useTransition } from "react";
import { TicketPercent, X } from "lucide-react";
import { checkDiscountCode } from "@/services/discounts/actions";
import { discountOn } from "@/services/discounts/codes";

export type AppliedDiscount = { code: string; percent: number };

/**
 * The discount total for a set of checkout lines — per line, rounded per
 * line, exactly like the server (`startCartCheckout` discounts each
 * agreement separately), so the total shown is the total charged.
 */
export function discountForLines(linePesewas: bigint[], discount: AppliedDiscount | null): bigint {
  if (!discount) return BigInt(0);
  return linePesewas.reduce((sum, amount) => sum + discountOn(amount, discount.percent), BigInt(0));
}

/**
 * "Have a discount code?" — used in the booking dialog and the cart. Apply
 * checks the code with the server (it must be this student's, active, unused
 * and unexpired) and reports the percentage up; the parent shows the new
 * total and posts the code with the checkout, where it is checked again.
 */
export function DiscountCodeField({
  applied,
  onChange,
}: {
  applied: AppliedDiscount | null;
  onChange: (discount: AppliedDiscount | null) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <span className="flex items-center gap-1.5">
          <TicketPercent className="h-4 w-4" aria-hidden="true" />
          <span className="font-mono font-semibold">{applied.code}</span> — {applied.percent}% off
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-emerald-100"
          aria-label="Remove discount code"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" /> Remove
        </button>
      </div>
    );
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const result = await checkDiscountCode(value);
      if (result.ok) {
        onChange({ code: result.code, percent: result.percent });
        setValue("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <label htmlFor="discount-code" className="mb-1 block text-sm font-medium text-slate-700">
        Discount code <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <div className="flex gap-2">
        <input
          id="discount-code"
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            // Enter applies the code instead of submitting the payment form.
            if (e.key === "Enter") {
              e.preventDefault();
              if (value.trim()) apply();
            }
          }}
          placeholder="e.g. AMA-ME2-K7QX9P"
          autoComplete="off"
          className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 font-mono text-sm uppercase text-slate-900 shadow-xs placeholder:font-sans placeholder:normal-case placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
        />
        <button
          type="button"
          onClick={apply}
          disabled={pending || !value.trim()}
          className="inline-flex h-10 shrink-0 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Apply"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
