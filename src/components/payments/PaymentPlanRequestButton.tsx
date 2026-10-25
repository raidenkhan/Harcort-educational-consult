"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Fields";
import { adminWhatsappUrl } from "@/lib/config";
import {
  requestPaymentPlan,
  type PaymentPlanFormState,
} from "@/services/requests/mutations";

/**
 * The paywall's escape hatch: a student who can't pay the full semester fee
 * reaches the admin team two ways (0029):
 *
 *   1. WHATSAPP — the primary channel. The link pre-fills the course, the
 *      fee and their intent, so the admin gets context without asking.
 *   2. IN-SITE — the action opens (or re-enters) the student's admin
 *      conversation in /chat with the same context, for students who prefer
 *      to stay in the app.
 */
export function PaymentPlanRequestButton({
  requestId,
  courseName,
  feeDisplay,
  className,
}: {
  requestId: string;
  /** Prefilled into the WhatsApp message when known. */
  courseName?: string;
  /** Formatted semester fee, e.g. "GH₵1,200". */
  feeDisplay?: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentPlanFormState, FormData>(
    requestPaymentPlan,
    {},
  );

  const whatsappHref = adminWhatsappUrl(
    [
      "Hi Harcourt Educational Consult! I can't pay the full semester fee right now and would like to arrange a payment plan.",
      courseName ? `Course: ${courseName}` : null,
      feeDisplay ? `Semester fee: ${feeDisplay}` : null,
      "Please let me know how we can sort this out.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  if (state.conversationId) {
    return (
      <div className={className}>
        <p className="text-sm font-medium text-emerald-800" role="status">
          {state.message ?? "Sent to the admin team."}
        </p>
        <Link
          href="/chat"
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 underline-offset-4 hover:underline"
        >
          <MessageCircle className="h-4 w-4" />
          Open the conversation
        </Link>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-sm font-semibold text-slate-800">
        Can&apos;t pay the full amount right now?
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
        Talk to an admin — nothing moves until you&apos;ve agreed a plan
        together.
      </p>
      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 active:scale-[0.98]"
        >
          <MessageCircle className="h-4 w-4" />
          WhatsApp the admin team
        </a>
      )}
      <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="requestId" value={requestId} />
        <Input
          id={`plan-note-${requestId}`}
          name="note"
          type="text"
          maxLength={300}
          placeholder="Or ask in the app — e.g. I can pay GH₵100 this week"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          <LifeBuoy className="h-4 w-4" />
          {pending ? "Sending…" : "Ask an admin here"}
        </Button>
      </form>
      {state.error && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
