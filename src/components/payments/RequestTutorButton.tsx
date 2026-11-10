"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Check, CreditCard, Send, ShieldCheck, User, Users } from "lucide-react";
import { AccountChoiceModal } from "@/components/auth/AccountChoiceModal";
import { useCart } from "@/components/cart/CartProvider";
import { sendTutorRequest } from "@/services/requests/mutations";
import type { RequestFormState } from "@/services/requests/mutations";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Field } from "@/components/ui/Field";
import { Select, Textarea } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { SessionModePicker } from "@/components/auth/SessionModePicker";
import { sessionModeLabel, type SessionMode } from "@/services/auth/sessionFormat";
import { priceTag } from "@/components/tutors/ServicePrice";
import { CommitToCourseButton } from "./CommitToCourseButton";
import { PaymentPlanRequestButton } from "./PaymentPlanRequestButton";
import { formatGhs } from "@/lib/money";
import { cn } from "@/lib/cn";

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

/**
 * The whole booking flow in three words per step.
 *
 * Students told us the process felt long because the dialog never said what
 * came next — it looked like a form, then a payment wall appeared. Naming the
 * three steps (and showing which one you are on) makes the paywall expected
 * rather than a surprise.
 */
function BookingSteps({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1 as const, label: "Course & format" },
    { n: 2 as const, label: "Pay securely" },
    { n: 3 as const, label: "Tutor schedules" },
  ];
  return (
    <ol className="flex items-center gap-1.5" aria-label="Booking steps">
      {steps.map((item, index) => {
        const done = item.n < step;
        const active = item.n === step;
        return (
          <li key={item.n} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-brand-600 text-white"
                    : "bg-slate-200 text-slate-500",
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-3 w-3" /> : item.n}
            </span>
            <span
              className={cn(
                "truncate text-[11px] font-medium",
                active ? "text-slate-900" : "text-slate-500",
              )}
            >
              {item.label}
            </span>
            {index < steps.length - 1 && (
              <span className="h-px min-w-2 flex-1 bg-slate-200" aria-hidden="true" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RequestTutorButton({
  tutorProfileId,
  offerings,
  signedIn,
  className,
  defaultCourseId,
  profilePath,
  autoOpen = false,
}: {
  tutorProfileId: string;
  offerings: TutorOffering[];
  signedIn: boolean;
  className?: string;
  /** Which offering the dialog opens on — a per-course share link (?course=)
   *  and a profile row both name one, so the form never starts on the wrong
   *  course. */
  defaultCourseId?: string;
  /** The tutor's public profile path (`/tutors/HC-T-…`). A signed-out visitor
   *  who taps Request is sent through auth and lands back HERE, on this
   *  course, with the dialog open — not on a generic dashboard. */
  profilePath?: string;
  /** `?request=1` on the profile URL: open the dialog as soon as it mounts
   *  (set by the post-sign-in redirect). */
  autoOpen?: boolean;
}) {
  // Signed out: where to return after the "have an account?" choice.
  const [authNext, setAuthNext] = useState<string | null>(null);
  const { disabled: bookingDisabled } = useCart();
  // A return-from-auth URL carries `?request=1`, so the dialog is open on the
  // FIRST render — no flash of the closed button.
  const [open, setOpen] = useState(autoOpen);
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

  /**
   * Return-from-sign-in: the auth form posts a `next` path that comes back to
   * this page with `?course=…&request=1`. The dialog is already open (state
   * above); drop the marker so a refresh — or a URL the student copies out of
   * the address bar — does not re-open it.
   */
  useEffect(() => {
    if (!autoOpen) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("request") !== "1") return;
    url.searchParams.delete("request");
    window.history.replaceState(
      null,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [autoOpen]);

  // Signed-out visitors go through auth and come back to this exact course.
  // The auth form validates `next` server-side (safeNextPath) — this only
  // builds a same-site path.
  // Admins are staff and never book — the control disappears for them
  // (CartAccessGate in the nav), and the server refuses admin checkouts.
  if (bookingDisabled) return null;

  if (!signedIn) {
    return (
      <>
        <button
          type="button"
          className={className}
          onClick={() => {
            const target = new URL(
              profilePath ?? window.location.pathname,
              window.location.origin,
            );
            if (initial?.courseId) {
              target.searchParams.set("course", initial.courseId);
            }
            target.searchParams.set("request", "1");
            // Ask "have an account?" first — sign in or sign up — and come
            // back to this tutor's course with the request dialog open.
            setAuthNext(`${target.pathname}${target.search}`);
          }}
        >
          Request
        </button>
        <AccountChoiceModal
          open={authNext !== null}
          onClose={() => setAuthNext(null)}
          next={authNext ?? undefined}
        />
      </>
    );
  }

  const paywall = state?.paywall;
  const selected = offerings.find((o) => o.courseId === courseId) ?? first;
  const offeredModes = modesFor(selected);
  const disabledModes = (["one_on_one", "group"] as const).filter(
    (candidate) => !offeredModes.includes(candidate),
  );
  // The price for the format on screen — the same field the paywall reads, so
  // the number in the summary is the number that will be charged.
  const selectedPrice = selected
    ? mode === "group"
      ? selected.priceGroup
      : selected.priceOneOnOne
    : null;

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
        title={paywall ? "Confirm your booking" : "Book a tutor"}
        description={
          paywall
            ? undefined
            : "Choose the course and format, then pay the semester fee to confirm. Three steps, about a minute."
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
          <div className="mt-4 space-y-4">
            <BookingSteps step={2} />

            <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Request sent — payment required
                </p>
                <Badge tone={paywall.sessionMode === "group" ? "brand" : "neutral"}>
                  {paywall.sessionMode === "group" ? (
                    <Users className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <User className="h-3 w-3" aria-hidden="true" />
                  )}
                  {sessionModeLabel(paywall.sessionMode)}
                </Badge>
              </div>
              <h3 className="mt-2 font-display text-xl font-bold tracking-[-0.01em] text-slate-900">
                {formatGhs(BigInt(paywall.chargePesewas))} to confirm
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                Full semester fee of{" "}
                {formatGhs(BigInt(paywall.totalPesewas))} for{" "}
                <span className="font-medium">{paywall.courseName}</span> with{" "}
                <span className="font-medium">{paywall.tutorName}</span>
                {paywall.feePesewas > 0 && (
                  <>
                    , plus a{" "}
                    {formatGhs(BigInt(paywall.feePesewas))} Paystack service
                    fee
                  </>
                )}{" "}
                — paid once, up front.
              </p>

              {paywall.groupName && (
                <p className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-200 bg-white/70 px-2.5 py-2 text-xs leading-relaxed text-emerald-800">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    You&apos;re in <strong>{paywall.groupName}</strong> —{" "}
                    <Link
                      href="/groups"
                      className="font-semibold underline underline-offset-2"
                    >
                      open Groups
                    </Link>{" "}
                    to meet your classmates.
                  </span>
                </p>
              )}

              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Paying confirms your booking — the tutor then schedules your
                sessions. Payments go to Harcourt, never to the tutor. The
                service fee is what Paystack charges to process the payment.
              </p>
              <div className="mt-4">
                <CommitToCourseButton
                  tutorServiceId={paywall.tutorServiceId}
                  label={`Pay ${formatGhs(BigInt(paywall.chargePesewas))} now`}
                  signedIn
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-600 px-4 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <PaymentPlanRequestButton
                requestId={paywall.requestId}
                courseName={paywall.courseName}
                feeDisplay={formatGhs(BigInt(paywall.totalPesewas))}
              />
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Pay later from my dashboard
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="mt-4 space-y-3">
            <BookingSteps step={1} />
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
            {/* Keyed on the course: the picker is controlled via the value prop,
                so a new course must remount it with the format that course
                actually offers. */}
            <SessionModePicker
              key={courseId}
              value={mode}
              disabledModes={disabledModes}
              prices={{
                one_on_one: selected?.priceOneOnOne ?? null,
                group: selected?.priceGroup ?? null,
              }}
              onChange={setMode}
              legend="Session format for this request"
              hint="One-on-one or group — for this tutor only. You can pick differently for another tutor."
            />

            {/* What the student is about to buy, in one line — the same fields
                the paywall prices. */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {selected?.name ?? "Choose a course"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {sessionModeLabel(mode)} · per semester
                  </p>
                </div>
                <p className="shrink-0 font-display text-lg font-bold text-slate-900">
                  {selectedPrice !== null ? priceTag(selectedPrice) : "—"}
                </p>
              </div>
              {mode === "group" && selectedPrice !== null && (
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-brand-800">
                  <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  You&apos;ll be added to the tutor&apos;s study group for this
                  course as soon as you send the request.
                </p>
              )}
            </div>

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
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                {pending ? "Sending…" : "Continue to payment"}
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
