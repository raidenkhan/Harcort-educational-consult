"use client";

import { useActionState, useState } from "react";
import { Send, ShieldCheck } from "lucide-react";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { sendTutorRequest } from "@/services/requests/mutations";
import type { RequestFormState } from "@/services/requests/mutations";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select, Textarea } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { SessionModePicker } from "@/components/auth/SessionModePicker";
import type { SessionMode } from "@/services/auth/sessionFormat";
import { CommitToCourseButton } from "./CommitToCourseButton";
import { PaymentPlanRequestButton } from "./PaymentPlanRequestButton";
import { formatGhs } from "@/lib/money";

/**
 * "Request tutoring" CTA on a directory card.
 *
 * Signed out → auth modal. Signed in → a small dialog picks the course, the
 * session format for THIS request (one-on-one vs group — 0024; a student may
 * choose differently for the next tutor), and an optional note.
 *
 * Since 0031 each course carries a price PER FORMAT, and either may be blank
 * (the tutor doesn't teach it that way). The picker therefore disables a
 * format the chosen course doesn't offer, and re-picking the course moves the
 * selection to a format that exists — the paywall then charges the price for
 * exactly the format the student picked.
 *
 * The moment the request is sent the dialog becomes the PAYWALL: the full
 * semester fee is due to activate sessions (0029 — 100% upfront), payable
 * immediately (the tutor accepts to schedule, not to unlock payment). A
 * student who can't pay in full reaches the admin team from the same panel —
 * WhatsApp first, or in-site with the context pre-filled.
 */
export interface TutorOffering {
  courseId: string;
  name: string;
  /** Per student, per semester. Null = the tutor doesn't offer that format. */
  priceOneOnOne: number | null;
  priceGroup: number | null;
}

/** The formats this offering can be requested in, one-on-one first. */
function modesFor(offering: TutorOffering | undefined): SessionMode[] {
  if (!offering) return ["one_on_one"];
  const modes: SessionMode[] = [];
  if (offering.priceOneOnOne !== null) modes.push("one_on_one");
  if (offering.priceGroup !== null) modes.push("group");
  return modes.length > 0 ? modes : ["one_on_one"];
}

export function RequestTutorButton({
  tutorProfileId,
  offerings,
  signedIn,
  className,
  defaultCourseId,
}: {
  tutorProfileId: string;
  offerings: TutorOffering[];
  signedIn: boolean;
  className?: string;
  /** Which offering the dialog opens on — a per-course share link (?course=)
   *  and a profile row both name one, so the form never starts on the wrong
   *  course. */
  defaultCourseId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<RequestFormState, FormData>(
    sendTutorRequest,
    {},
  );

  const first = offerings[0];
  // A per-course link names one offering; ignore it when the tutor no longer
  // teaches that course rather than leaving the <select> on a value it cannot
  // render.
  const initial =
    offerings.find((o) => o.courseId === defaultCourseId) ?? first;
  const [courseId, setCourseId] = useState(initial?.courseId ?? "");
  const [mode, setMode] = useState<SessionMode>(modesFor(initial)[0]);

  // Signed-out visitors get the auth modal — same session-aware pattern
  // as ContactTutorButton.
  if (!signedIn) {
    return (
      <AuthTrigger tab="sign-up" className={className}>
        Request
      </AuthTrigger>
    );
  }

  const paywall = state?.paywall;
  const selected = offerings.find((o) => o.courseId === courseId) ?? first;
  const offeredModes = modesFor(selected);
  const disabledModes = (["one_on_one", "group"] as const).filter(
    (candidate) => !offeredModes.includes(candidate),
  );

  function chooseCourse(nextId: string) {
    setCourseId(nextId);
    // Never leave a disabled format selected — it would be unsubmittable.
    setMode(modesFor(offerings.find((o) => o.courseId === nextId))[0]);
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
        title={paywall ? "Pay to activate your sessions" : "Request tutoring"}
        description={
          paywall
            ? undefined
            : "Pick the course and how you want to learn. You pay the semester fee as soon as the request is sent."
        }
      >
        {!paywall && state?.error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}
        {!paywall && state?.message && (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.message}
          </div>
        )}

        {paywall ? (
          <div className="mt-4">
            <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                <ShieldCheck className="h-4 w-4" />
                Request sent — payment required
              </p>
              <h3 className="mt-2 font-display text-xl font-bold tracking-[-0.01em] text-slate-900">
                {formatGhs(BigInt(paywall.duePesewas))} to start
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                Full semester fee of{" "}
                {formatGhs(BigInt(paywall.totalPesewas))} for{" "}
                <span className="font-medium">{paywall.courseName}</span> with{" "}
                <span className="font-medium">{paywall.tutorName}</span> — paid
                up front (0029: no installment split).
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Paying now holds your place; the tutor then confirms the
                timetable. Payments go to Harcourt, never to the tutor.
              </p>
              <div className="mt-4">
                <CommitToCourseButton
                  tutorServiceId={paywall.tutorServiceId}
                  label={`Pay ${formatGhs(BigInt(paywall.duePesewas))} now`}
                  signedIn
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 p-4">
              <PaymentPlanRequestButton
                requestId={paywall.requestId}
                courseName={paywall.courseName}
                feeDisplay={formatGhs(BigInt(paywall.totalPesewas))}
              />
            </div>

            <div className="mt-3 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Pay later from my dashboard
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="mt-4 space-y-3">
            <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
            <Field label="Course" htmlFor="courseId">
              <Select
                id="courseId"
                name="courseId"
                value={courseId}
                onChange={(event) => chooseCourse(event.target.value)}
              >
                {offerings.map((o) => {
                  const from =
                    o.priceOneOnOne === null
                      ? o.priceGroup
                      : o.priceGroup === null
                        ? o.priceOneOnOne
                        : Math.min(o.priceOneOnOne, o.priceGroup);
                  return (
                    <option key={o.courseId} value={o.courseId}>
                      {o.name}
                      {from !== null
                        ? ` · from GH₵${from.toLocaleString()}/semester`
                        : " · rates on request"}
                    </option>
                  );
                })}
              </Select>
            </Field>
            {/* Keyed on the course: the picker is uncontrolled (native
                :checked styling), so a new course must remount it with the
                format that course actually offers. */}
            <SessionModePicker
              key={courseId}
              defaultMode={mode}
              disabledModes={disabledModes}
              onChange={setMode}
              legend="Session format for this request"
              hint="One-on-one or group — for this tutor only. You can pick differently for another tutor."
            />
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
                {pending ? "Sending…" : "Send request & continue to payment"}
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
