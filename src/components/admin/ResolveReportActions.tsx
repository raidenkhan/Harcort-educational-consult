"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { resolveReport } from "@/services/moderation/mutations";
import type { ReportFormState } from "@/services/moderation/mutations";
import { Button } from "@/components/ui/Button";

/**
 * Resolve/dismiss pair for one report. The optional note lives INSIDE the
 * form so it submits with whichever decision button is pressed; it's stored
 * on the report and included in the reporter's email.
 */
export function ResolveReportActions({ reportId }: { reportId: string }) {
  const [state, formAction, pending] = useActionState<ReportFormState, FormData>(
    resolveReport,
    {},
  );
  const [showNote, setShowNote] = useState(false);

  if (state.message) {
    return (
      <p className="text-xs font-medium text-emerald-700" role="status">
        {state.message}
      </p>
    );
  }

  return (
    <div className="w-full space-y-2 sm:w-64">
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="reportId" value={reportId} />
        {showNote && (
          <textarea
            name="note"
            rows={2}
            maxLength={1000}
            placeholder="Optional note — stored on the report, included in the reporter's email"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:ring-1 focus:ring-brand-100 focus:outline-none"
          />
        )}
        <div className="flex gap-2">
          <Button
            type="submit"
            name="decision"
            value="resolved"
            disabled={pending}
            className="flex-1"
          >
            <Check className="mr-1 h-4 w-4" />
            Resolve
          </Button>
          <Button
            type="submit"
            name="decision"
            value="dismissed"
            variant="secondary"
            disabled={pending}
            className="flex-1"
          >
            <X className="mr-1 h-4 w-4" />
            Dismiss
          </Button>
        </div>
      </form>
      <button
        type="button"
        onClick={() => setShowNote((v) => !v)}
        className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
      >
        {showNote ? "Hide note" : "Add note"}
      </button>
      {state.error && (
        <p className="text-xs text-red-700" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
