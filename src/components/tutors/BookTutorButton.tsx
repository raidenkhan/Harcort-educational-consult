"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CalendarCheck, Check, CreditCard, Minus, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useAuthModal } from "@/components/auth/AuthModal";
import { useCart } from "@/components/cart/CartProvider";
import type { CartOffering } from "@/components/cart/AddToCartButton";
import { startCartCheckout, type PaymentFormState } from "@/services/payments/mutations";
import { checkoutTotal } from "@/services/payments/fees";
import { MAX_SEMESTERS, MIN_SEMESTERS } from "@/services/cart/cart";
import type { SessionMode } from "@/services/auth/sessionFormat";
import { formatGhs } from "@/lib/money";
import { cn } from "@/lib/cn";

const MODE_LABEL: Record<SessionMode, string> = {
  one_on_one: "One-on-one",
  group: "Group",
};

function priceFor(offering: CartOffering, mode: SessionMode): number | null {
  return mode === "group" ? offering.priceGroup : offering.priceOneOnOne;
}

const toPesewas = (cedis: number) => BigInt(Math.round(cedis * 100));

/**
 * "Book tutor" — the tutor card's main action.
 *
 * Opens a dialog where the student:
 *   1. picks ONE session format for the whole booking (courses the tutor
 *      doesn't teach in that format are greyed out),
 *   2. ticks the courses they want,
 *   3. chooses how many semesters (1–4) — prices stay per semester,
 * and watches a live price counter (courses × semesters + Paystack's fee).
 *
 * "Make payment":
 *   - signed in  → one Paystack charge for everything (`startCartCheckout`,
 *     the same batch path as the cart); the server re-prices every line.
 *   - signed out → the selection is saved to the cart (localStorage survives
 *     the sign-in round trip) and the auth modal opens, returning to /cart.
 *
 * The total shown is computed with the same `checkoutTotal` the server
 * charges with, so the number on the button is the number on Paystack.
 */
export function BookTutorButton({
  tutorName,
  offerings,
  signedIn,
  className,
}: {
  tutorName: string;
  offerings: CartOffering[];
  signedIn: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Formats at least one course is offered in, one-on-one first.
  const modes = useMemo(() => {
    const available: SessionMode[] = [];
    if (offerings.some((o) => o.priceOneOnOne !== null)) available.push("one_on_one");
    if (offerings.some((o) => o.priceGroup !== null)) available.push("group");
    return available;
  }, [offerings]);

  const [mode, setMode] = useState<SessionMode>(modes[0] ?? "one_on_one");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [semesters, setSemesters] = useState(1);

  const { open: openAuth } = useAuthModal();
  const { add } = useCart();
  const [state, formAction, pending] = useActionState<PaymentFormState, FormData>(
    startCartCheckout,
    {},
  );

  useEffect(() => {
    if (state?.checkoutUrl) window.location.assign(state.checkoutUrl);
  }, [state]);

  // Only courses offered in the chosen format count, so switching format can
  // never charge a course in a format the tutor doesn't teach.
  const chosen = offerings.filter(
    (o) => selected.has(o.tutorServiceId) && priceFor(o, mode) !== null,
  );
  const perSemester = chosen.reduce(
    (sum, o) => sum + toPesewas(priceFor(o, mode) ?? 0),
    BigInt(0),
  );
  const subtotal = perSemester * BigInt(semesters);
  const { feePesewas, totalPesewas } = checkoutTotal(subtotal);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const lines = chosen.map((o) => ({
    tutorServiceId: o.tutorServiceId,
    tutorProfileId: o.tutorProfileId,
    courseId: o.courseId,
    mode,
    semesters,
  }));

  const payForSignedOut = () => {
    for (const o of chosen) {
      add({
        tutorServiceId: o.tutorServiceId,
        tutorProfileId: o.tutorProfileId,
        tutorName: o.tutorName,
        tutorCode: o.tutorCode ?? null,
        courseId: o.courseId,
        courseName: o.courseName,
        courseCode: o.courseCode ?? null,
        mode,
        priceOneOnOne: o.priceOneOnOne,
        priceGroup: o.priceGroup,
        semesters,
      });
    }
    setOpen(false);
    openAuth("sign-in", "/cart");
  };

  if (modes.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-sm font-medium text-slate-500",
          className,
        )}
      >
        Pricing coming soon
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md bg-brand-600 text-sm font-semibold text-white shadow-xs transition duration-150 hover:bg-brand-700 active:scale-[0.97]",
          className,
        )}
      >
        <CalendarCheck className="h-4 w-4" aria-hidden="true" />
        Book tutor
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Book ${tutorName}`}
        description="Choose your courses and how long you want tutoring. Prices are per semester."
        className="max-w-lg"
      >
        <form action={formAction} className="mt-5 space-y-5">
          <input type="hidden" name="cartLines" value={JSON.stringify(lines)} />
          <input type="hidden" name="returnTo" value="dashboard" />

          {/* 1 — format */}
          {modes.length > 1 && (
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">Session format</legend>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                {modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "h-9 rounded-md text-sm font-semibold transition duration-150",
                      mode === m
                        ? "bg-white text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {MODE_LABEL[m]}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {/* 2 — courses */}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">
              Courses{" "}
              <span className="font-normal text-slate-500">
                · {MODE_LABEL[mode].toLowerCase()}
              </span>
            </legend>
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
              {offerings.map((o) => {
                const price = priceFor(o, mode);
                const offered = price !== null;
                const checked = offered && selected.has(o.tutorServiceId);
                return (
                  <li key={o.tutorServiceId}>
                    <label
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition duration-150",
                        !offered
                          ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                          : checked
                            ? "cursor-pointer border-brand-500 bg-brand-50"
                            : "cursor-pointer border-slate-200 bg-white hover:border-slate-300",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        disabled={!offered}
                        onChange={() => toggle(o.tutorServiceId)}
                      />
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                          checked
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-slate-300 bg-white",
                        )}
                      >
                        {checked && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {o.courseName}
                        </span>
                        {o.courseCode && (
                          <span className="block text-xs text-slate-500">{o.courseCode}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-right text-sm font-semibold text-slate-900">
                        {price !== null ? (
                          <>
                            {formatGhs(toPesewas(price))}
                            <span className="block text-[11px] font-normal text-slate-500">
                              /semester
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-normal text-slate-500">
                            Not offered
                          </span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {/* 3 — semesters */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Semesters</p>
              <p className="text-xs text-slate-500">How long you want tutoring</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                aria-label="Fewer semesters"
                disabled={semesters <= MIN_SEMESTERS}
                onClick={() => setSemesters((n) => Math.max(MIN_SEMESTERS, n - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-8 text-center font-display text-lg font-bold text-slate-900" aria-live="polite">
                {semesters}
              </span>
              <button
                type="button"
                aria-label="More semesters"
                disabled={semesters >= MAX_SEMESTERS}
                onClick={() => setSemesters((n) => Math.min(MAX_SEMESTERS, n + 1))}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Price counter */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" aria-live="polite">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>
                  {chosen.length} {chosen.length === 1 ? "course" : "courses"} ×{" "}
                  {semesters} {semesters === 1 ? "semester" : "semesters"}
                </span>
                <span className="font-medium text-slate-900">{formatGhs(subtotal)}</span>
              </div>
              {feePesewas > BigInt(0) && (
                <div className="flex justify-between text-slate-600">
                  <span>Processing fee</span>
                  <span className="font-medium text-slate-900">{formatGhs(feePesewas)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="font-display text-2xl font-bold text-slate-900">
                  {formatGhs(totalPesewas)}
                </span>
              </div>
            </div>
          </div>

          {state?.error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {state.error}
            </p>
          )}

          {signedIn ? (
            <button
              type="submit"
              disabled={chosen.length === 0 || pending || Boolean(state?.checkoutUrl)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-600 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              {pending || state?.checkoutUrl
                ? "Opening payment…"
                : chosen.length === 0
                  ? "Choose a course"
                  : `Make payment · ${formatGhs(totalPesewas)}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={payForSignedOut}
              disabled={chosen.length === 0}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-600 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              {chosen.length === 0 ? "Choose a course" : "Sign in to make payment"}
            </button>
          )}

          <p className="text-center text-xs text-slate-500">
            You pay Harcourt, never the tutor directly. One charge covers every course.
          </p>
        </form>
      </Modal>
    </>
  );
}
