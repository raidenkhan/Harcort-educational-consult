"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Fields";
import {
  requestPaymentPlan,
  type PaymentPlanFormState,
} from "@/services/requests/mutations";

/**
 * The paywall's escape hatch: a student who can't pay the first 50% in full
 * asks the admin team, from inside the site. The action opens (or re-enters)
 * the student's admin conversation in /chat with the course, tutor, amount
 * and their student code already filled in, so the admin can reply with a
 * plan without asking for context.
 */
export function PaymentPlanRequestButton({
  requestId,
  className,
}: {
  requestId: string;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<PaymentPlanFormState, FormData>(
    requestPaymentPlan,
    {},
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
    <form action={formAction} className={className}>
      <input type="hidden" name="requestId" value={requestId} />
      <label htmlFor={`plan-note-${requestId}`} className="block text-sm font-medium text-slate-700">
        Can&apos;t pay the full amount right now?
      </label>
      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
        Tell an admin what you can pay and when. Nothing moves until they agree
        a plan with you.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Input
          id={`plan-note-${requestId}`}
          name="note"
          type="text"
          maxLength={300}
          placeholder="e.g. I can pay GH₵100 this week and the rest next week"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" disabled={pending} className="shrink-0">
          <LifeBuoy className="h-4 w-4" />
          {pending ? "Sending…" : "Ask an admin"}
        </Button>
      </div>
      {state.error && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
