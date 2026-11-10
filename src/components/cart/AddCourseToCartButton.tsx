"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useCart } from "@/components/cart/CartProvider";
import type { CartOffering } from "@/components/cart/AddToCartButton";
import { cartLineModes } from "@/services/cart/cart";
import type { SessionMode } from "@/services/auth/sessionFormat";
import { formatGhs } from "@/lib/money";
import { cn } from "@/lib/cn";

const MODE_LABEL: Record<SessionMode, string> = {
  one_on_one: "One-on-one",
  group: "Group",
};

const priceFor = (o: CartOffering, mode: SessionMode) =>
  mode === "group" ? o.priceGroup : o.priceOneOnOne;

const ghs = (cedis: number) => formatGhs(BigInt(Math.round(cedis * 100)));

/**
 * "Add to cart" on a course row in the /courses directory.
 *
 * A cart line is one TUTOR's offering for a course, but the directory row is
 * just the course — so this button carries every approved offering for the
 * course (matched by normalised code on the server, since one real course can
 * have a row per programme). With exactly one tutor teaching it in exactly one
 * format, a tap adds it; otherwise a small dialog asks which tutor and which
 * format. No tutor yet → an honest note instead of a dead button.
 *
 * Sits ABOVE the row's stretched link (`relative z-10`), so tapping it never
 * opens the course page.
 */
export function AddCourseToCartButton({
  courseName,
  offerings,
  className,
}: {
  courseName: string;
  offerings: CartOffering[];
  className?: string;
}) {
  const { add, lines, disabled } = useCart();
  const [open, setOpen] = useState(false);
  const [serviceId, setServiceId] = useState(offerings[0]?.tutorServiceId ?? "");
  const [mode, setMode] = useState<SessionMode>("one_on_one");
  const [justAdded, setJustAdded] = useState(false);

  const usable = offerings.filter((o) => cartLineModes(o).length > 0);
  const inCart = usable.some((o) => lines.some((l) => l.tutorServiceId === o.tutorServiceId));

  // Admins are staff and never book — the control disappears for them
  // (CartAccessGate in the nav), and the server refuses admin checkouts.
  if (disabled) return null;

  if (usable.length === 0) {
    return (
      <span className={cn("relative z-10 text-xs font-medium text-slate-400", className)}>
        No tutor yet
      </span>
    );
  }

  const addOffering = (o: CartOffering, m: SessionMode) => {
    add({
      tutorServiceId: o.tutorServiceId,
      tutorProfileId: o.tutorProfileId,
      tutorName: o.tutorName,
      tutorCode: o.tutorCode ?? null,
      courseId: o.courseId,
      courseName: o.courseName,
      courseCode: o.courseCode ?? null,
      mode: m,
      priceOneOnOne: o.priceOneOnOne,
      priceGroup: o.priceGroup,
      semesters: 1,
    });
    setJustAdded(true);
  };

  const selected = usable.find((o) => o.tutorServiceId === serviceId) ?? usable[0];
  const selectedModes = cartLineModes(selected);
  const activeMode = selectedModes.includes(mode) ? mode : selectedModes[0];

  const onClick = () => {
    const only = usable[0];
    const onlyModes = cartLineModes(only);
    if (usable.length === 1 && onlyModes.length === 1) {
      addOffering(only, onlyModes[0]);
      return;
    }
    setJustAdded(false);
    setOpen(true);
  };

  const added = justAdded && !open;

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Add ${courseName} to cart`}
        className={cn(
          "relative z-10 inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold shadow-xs transition duration-150 active:scale-[0.97]",
          added || inCart
            ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
            : "bg-brand-600 text-white hover:bg-brand-700",
          className,
        )}
      >
        {added || inCart ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span aria-live="polite">{added ? "Added" : inCart ? "In cart" : "Add to cart"}</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add to cart"
        description={`${courseName} — choose your tutor and session format. Prices are per semester.`}
      >
        {justAdded ? (
          <div className="mt-4 space-y-3">
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Added to your cart. Keep browsing — pay for everything at once.
            </p>
            <div className="flex gap-2">
              <Link
                href="/cart"
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Go to cart
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Keep browsing
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {usable.length > 1 && (
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">Tutor</legend>
                <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
                  {usable.map((o) => {
                    const checked = o.tutorServiceId === selected.tutorServiceId;
                    const prices = cartLineModes(o)
                      .map((m) => `${MODE_LABEL[m]} ${ghs(priceFor(o, m) ?? 0)}`)
                      .join(" · ");
                    return (
                      <li key={o.tutorServiceId}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition",
                            checked
                              ? "border-brand-500 bg-brand-50"
                              : "border-slate-200 bg-white hover:border-slate-300",
                          )}
                        >
                          <input
                            type="radio"
                            name="cart-tutor"
                            className="accent-brand-600"
                            checked={checked}
                            onChange={() => setServiceId(o.tutorServiceId)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">
                              {o.tutorName}
                            </span>
                            <span className="block text-xs text-slate-500">{prices}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}

            {selectedModes.length > 1 && (
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">Session format</legend>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                  {selectedModes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={activeMode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        "h-9 rounded-md text-sm font-semibold transition",
                        activeMode === m
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

            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{selected.tutorName}</p>
                <p className="text-xs text-slate-500">
                  {MODE_LABEL[activeMode]} · per semester
                </p>
              </div>
              <p className="font-display text-lg font-bold text-slate-900">
                {ghs(priceFor(selected, activeMode) ?? 0)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => addOffering(selected, activeMode)}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-brand-600 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 active:scale-[0.98]"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              Add to cart
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
