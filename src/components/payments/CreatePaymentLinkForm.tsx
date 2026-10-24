"use client";

import { useActionState, useState } from "react";
import { Link2 } from "lucide-react";
import {
  createPaymentRequest,
  type PaymentFormState,
} from "@/services/payments/mutations";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Fields";

/**
 * Admin issues a single-use part-payment link (0032).
 *
 * The student hits the paywall, asks for a plan, and the admin sends them a
 * URL for a specific amount. The link charges exactly that amount through
 * Paystack; it is single-use and expires, and the DB re-checks the amount
 * against the live outstanding balance, so it can never collect more than the
 * student owes.
 *
 * The raw token comes back ONCE (the database stores only its hash), so the
 * copy button is the only way to get it — say so in the UI.
 */
export function CreatePaymentLinkForm({
  engagementId,
  remainingCedis,
}: {
  engagementId: string;
  /** Outstanding balance in whole cedis — the default amount to collect. */
  remainingCedis: number;
}) {
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    createPaymentRequest,
    {},
  );
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    if (!state.linkPath) return;
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${state.linkPath}`,
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context) — the path is on screen to copy.
      setCopied(false);
    }
  }

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="engagementId" value={engagementId} />
      <p className="text-xs font-semibold text-slate-700">
        Send a part-payment link
      </p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        <Input
          name="amountCedis"
          type="number"
          min="0.01"
          step="0.01"
          required
          defaultValue={remainingCedis > 0 ? remainingCedis : undefined}
          placeholder="Amount (GH₵)"
          aria-label="Amount the student should pay through the link"
          className="w-32 shrink-0"
        />
        <Input
          name="note"
          type="text"
          maxLength={280}
          placeholder="Note — e.g. first half of the fee"
          aria-label="Note for the student"
          className="min-w-0 flex-1"
        />
        <Input
          name="validDays"
          type="number"
          min="1"
          max="60"
          step="1"
          defaultValue={7}
          aria-label="Days the link stays valid"
          title="Days the link stays valid"
          className="w-20 shrink-0"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          <Link2 className="h-4 w-4" />
          {pending ? "Creating…" : "Create link"}
        </Button>
      </div>

      {state?.error && (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}

      {state?.linkPath && (
        <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-medium text-emerald-800">
            {state.message}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-[11px] text-slate-700">
              {state.linkPath}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={copyLink}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-800/80">
            Copy it now — only the link&apos;s hash is stored, so it can&apos;t
            be shown again. Single use; it stops working once paid or expired.
          </p>
        </div>
      )}
    </form>
  );
}
