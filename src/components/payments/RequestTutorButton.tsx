"use client";

import { useActionState, useState } from "react";
import { Send } from "lucide-react";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { sendTutorRequest } from "@/services/requests/mutations";
import type { RequestFormState } from "@/services/requests/mutations";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select, Textarea } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";

/**
 * "Request tutoring" CTA on a directory card.
 *
 * Signed out → auth modal. Signed in → opens a small dialog to pick the
 * course and add an optional note, then sends the structured request via
 * the 0012 RPC. The tutor accepts from their inbox; only then does the
 * student's Pay 50% path unlock (request-first, pay-after-acceptance).
 */
export function RequestTutorButton({
  tutorProfileId,
  offerings,
  signedIn,
  className,
}: {
  tutorProfileId: string;
  offerings: Array<{ courseId: string; name: string; price: number }>;
  signedIn: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    sendTutorRequest,
    {},
  );

  // Signed-out visitors get the auth modal — same session-aware pattern
  // as ContactTutorButton.
  if (!signedIn) {
    return (
      <AuthTrigger tab="sign-up" className={className}>
        Request
      </AuthTrigger>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-haspopup="dialog"
      >
        <Send className="mr-1 inline h-3 w-3" />
        Request
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Request tutoring"
        description="Pick the course you need help with. The tutor accepts, then your payment unlocks — 50% now, 50% by the final session."
      >
        {state?.error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}
        {state?.message && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.message}
          </div>
        )}

        <form action={formAction} className="mt-4 space-y-3">
          <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
          <Field label="Course" htmlFor="courseId">
            <Select id="courseId" name="courseId" defaultValue={offerings[0]?.courseId ?? ""}>
              {offerings.map((o) => (
                <option key={o.courseId} value={o.courseId}>
                  {o.name} · GH₵{o.price.toLocaleString()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)" htmlFor="message">
            <Textarea
              id="message"
              name="message"
              rows={3}
              maxLength={500}
              placeholder="Anything the tutor should know — your level, exam date, what you're stuck on…"
            />
          </Field>
          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={pending} className="flex-1">
              {pending ? "Sending…" : "Send request"}
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
      </Modal>
    </>
  );
}
