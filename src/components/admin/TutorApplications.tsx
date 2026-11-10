"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { approveTutor, rejectTutor } from "@/services/admin/mutations";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Fields";
import { cn } from "@/lib/cn";

export type ApplicationRow = {
  id: string;
  name: string;
  publicCode: string | null;
  appliedLabel: string;
  bio: string | null;
};

type Decision = "approve" | "reject";

/**
 * Approve / Reject for one application. Both open the same small modal with
 * an OPTIONAL message to the tutor (it's included in the email they get);
 * confirming runs the existing admin RPC-backed action.
 */
function ReviewButton({ application, decision }: { application: ApplicationRow; decision: Decision }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const approve = decision === "approve";

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await (approve ? approveTutor(formData) : rejectTutor(formData));
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold shadow-xs transition",
          approve
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : // Light red at rest; a shade deeper on hover; deep red while pressed.
              "border border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100 active:border-red-700 active:bg-red-600 active:text-white",
        )}
      >
        {approve ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
        {approve ? "Approve" : "Reject"}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${approve ? "Approve" : "Reject"} ${application.name}?`}
        description={
          approve
            ? "They'll appear in the tutor directory and can be booked. Add a message if you like — it's included in the email they get."
            : "They won't appear in the directory. Add a reason if you like — it's included in the email they get."
        }
        className="max-w-md"
      >
        <form action={submit} className="mt-4 space-y-3">
          <input type="hidden" name="tutorProfileId" value={application.id} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">
              {approve ? "Message" : "Reason"} <span className="font-normal text-slate-400">(optional)</span>
            </span>
            <Textarea name="note" rows={3} maxLength={500} placeholder={approve ? "Welcome aboard!" : "e.g. Please add your qualifications and reapply."} />
          </label>
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <button
              type="submit"
              disabled={pending}
              className={cn(
                "inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold text-white shadow-xs transition disabled:opacity-60",
                approve ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700",
              )}
            >
              {pending ? "Saving…" : approve ? "Approve tutor" : "Reject tutor"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Admin → People → Tutor applications: one compact row per applicant with
 *  Approve / Reject aligned beside the name. */
export function TutorApplications({ applications }: { applications: ApplicationRow[] }) {
  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500">
        No pending applications. New tutor sign-ups will appear here for review.
      </div>
    );
  }

  return (
    <Card padded={false} className="divide-y divide-slate-100 overflow-hidden">
      {applications.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {a.name}
              {a.publicCode && (
                <span className="ml-2 font-mono text-xs font-normal text-slate-400">{a.publicCode}</span>
              )}
            </p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              Applied {a.appliedLabel}
              {a.bio ? ` · ${a.bio}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ReviewButton application={a} decision="approve" />
            <ReviewButton application={a} decision="reject" />
          </div>
        </div>
      ))}
    </Card>
  );
}
