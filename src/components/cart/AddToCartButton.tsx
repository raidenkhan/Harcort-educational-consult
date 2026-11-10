"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SessionModePicker } from "@/components/auth/SessionModePicker";
import { priceTag } from "@/components/tutors/ServicePrice";
import { useCart } from "@/components/cart/CartProvider";
import { cartLineModes, type CartLine } from "@/services/cart/cart";
import { sessionModeLabel, type SessionMode } from "@/services/auth/sessionFormat";
import { cn } from "@/lib/cn";

/** One purchasable course offering, as the card/profile page knows it. */
export interface CartOffering {
  tutorServiceId: string;
  tutorProfileId: string;
  tutorName: string;
  tutorCode?: string | null;
  courseId: string;
  courseName: string;
  courseCode?: string | null;
  /** Per student, per semester. Null = the tutor doesn't offer that format. */
  priceOneOnOne: number | null;
  priceGroup: number | null;
}

function toLine(offering: CartOffering, mode: SessionMode): CartLine {
  return {
    tutorServiceId: offering.tutorServiceId,
    tutorProfileId: offering.tutorProfileId,
    tutorName: offering.tutorName,
    tutorCode: offering.tutorCode ?? null,
    courseId: offering.courseId,
    courseName: offering.courseName,
    courseCode: offering.courseCode ?? null,
    mode,
    priceOneOnOne: offering.priceOneOnOne,
    priceGroup: offering.priceGroup,
    semesters: 1,
  };
}

function priceFor(offering: CartOffering, mode: SessionMode): number | null {
  return mode === "group" ? offering.priceGroup : offering.priceOneOnOne;
}

/**
 * "Add to cart" for one course offering.
 *
 * A tutor can price the same course differently for one-on-one and group
 * sessions, so the student must say WHICH format they are buying before the
 * line goes in the cart. When only one format is offered there is nothing to
 * ask — one tap adds it.
 *
 * The cart is local and works signed out; checkout (`/cart`) asks for auth.
 * That is deliberate: a visitor browsing the directory can shortlist courses
 * before creating an account.
 */
export function AddToCartButton({
  offering,
  className,
  label = "Add to cart",
  compact = false,
}: {
  offering: CartOffering;
  className?: string;
  label?: string;
  /** Icon-only-ish button for tight card rows. */
  compact?: boolean;
}) {
  const { add, lines, disabled } = useCart();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modes = cartLineModes(offering);
  const inCart = lines.some((line) => line.tutorServiceId === offering.tutorServiceId);
  const [mode, setMode] = useState<SessionMode>(modes[0] ?? "one_on_one");

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function flashAdded() {
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), 2200);
  }

  function addDirect() {
    const only = modes[0];
    if (!only) return;
    add(toLine(offering, only));
    flashAdded();
  }

  // Admins are staff and never book — the control disappears for them
  // (CartAccessGate in the nav), and the server refuses admin checkouts.
  if (disabled) return null;

  if (modes.length === 0) {
    return (
      <span className={cn("text-xs font-medium text-slate-500", className)}>
        Price on request
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (modes.length === 1) {
            addDirect();
          } else {
            setMode(modes.includes(mode) ? mode : modes[0]);
            setOpen(true);
          }
        }}
        className={cn(
          "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-xs transition duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.97]",
          added && "border-emerald-300 bg-emerald-50 text-emerald-700",
          className,
        )}
        aria-label={`Add ${offering.courseName} to cart`}
      >
        {added ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span aria-live="polite">
          {added ? "Added" : inCart ? "In cart" : compact ? "Add" : label}
        </span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add to cart"
        description={`${offering.courseName} with ${offering.tutorName} — choose the session format.`}
      >
        <div className="mt-4 space-y-4">
          <SessionModePicker
            name="cartSessionMode"
            value={mode}
            prices={{
              one_on_one: offering.priceOneOnOne,
              group: offering.priceGroup,
            }}
            onChange={setMode}
            legend="How do you want this course?"
            hint="Group sessions are per student and add you to the tutor's study group for this course."
          />

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {offering.courseName}
              </p>
              <p className="text-xs text-slate-500">
                {sessionModeLabel(mode)} · per semester
              </p>
            </div>
            <p className="font-display text-lg font-bold text-slate-900">
              {priceFor(offering, mode) !== null
                ? priceTag(priceFor(offering, mode) as number)
                : "—"}
            </p>
          </div>

          {added ? (
            <div className="space-y-3">
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Added to your cart. You can keep browsing — pay for everything
                at once when you are ready.
              </p>
              <div className="flex gap-2">
                <Link href="/cart" className="flex-1">
                  <Button className="w-full">Go to cart</Button>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                >
                  Keep browsing
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  add(toLine(offering, mode));
                  setAdded(true);
                }}
              >
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                Add to cart
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
