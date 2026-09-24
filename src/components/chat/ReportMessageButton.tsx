"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { fileReport } from "@/services/moderation/mutations";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Fields";
import { CheckCircle2 } from "lucide-react";

/**
 * Per-message "Report" affordance in the chat thread — a quiet flag icon
 * that appears on hover, opening a dialog that files a moderation report
 * via `fileReport`. Direct server-action call with local state (the same
 * pattern ChatView uses for sendMessage) so the dialog can reset cleanly
 * between opens — useActionState's sticky success state would resurface
 * the previous report's confirmation on the next one.
 */
export function ReportMessageButton({
  messageId,
  className,
}: {
  messageId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const openModal = () => {
    setDone(false);
    setError(null);
    setOpen(true);
  };

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await fileReport({}, formData);
    setPending(false);
    if (res.error) {
      setError(res.error);
    } else {
      setDone(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Report this message"
        title="Report this message"
        className={
          className ??
          "rounded p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-500 focus-visible:opacity-100"
        }
      >
        <Flag className="h-3.5 w-3.5" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report this message"
        description="Tell the Harcourt team what's wrong. An admin reviews every report."
      >
        {done ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Report submitted</p>
                <p className="mt-0.5 text-emerald-700">
                  An admin will review it, and you&apos;ll get an email once
                  it&apos;s handled.
                </p>
              </div>
            </div>
            <Button type="button" onClick={() => setOpen(false)} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <form action={submit} className="mt-4 space-y-3">
            <input type="hidden" name="targetType" value="message" />
            <input type="hidden" name="targetId" value={messageId} />
            <Field label="What's wrong with this message?" htmlFor="report-reason">
              <Textarea
                id="report-reason"
                name="reason"
                rows={4}
                required
                minLength={5}
                maxLength={1000}
                placeholder="Spam, harassment, impersonation, someone asking for payment off-platform…"
              />
            </Field>
            {error && (
              <p className="text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} className="flex-1">
                {pending ? "Sending…" : "Send report"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
