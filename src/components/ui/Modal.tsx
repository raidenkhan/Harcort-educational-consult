"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The app's one dialog primitive — every popup goes through this so the
 * a11y + behaviour can never drift between call sites:
 *
 *  - PORTAL to document.body. Load-bearing: cards in this app use hover
 *    transforms (`hover:-translate-y-0.5`), and a CSS transform on any
 *    ancestor makes `position: fixed` relative to that ancestor instead of
 *    the viewport — the overlay would resize between card-bounds and
 *    viewport-bounds as the cursor moved in and out of the card. The
 *    flicker on the /tutors request dialog was exactly this.
 *  - body scroll locks while open, with the scrollbar width compensated as
 *    padding so locking doesn't shift the whole page sideways (very visible
 *    on Windows where the scrollbar takes real width).
 *  - Escape closes via a document listener (works even if focus is elsewhere,
 *    e.g. right after opening, before the user tabs in)
 *  - focus moves into the panel on open, restored on close
 *  - backdrop click closes; clicks inside the panel never bubble to it
 *
 * The backdrop is a plain dim, deliberately NOT backdrop-blur: a full-screen
 * blur re-repaints every frame while anything animated sits beneath it
 * (AnimatedGradient hero on /tutors), and the dim + panel shadow carries the
 * separation fine.
 *
 * Server-render friendly: callers render `{open && <Modal>…</Modal>}` so the
 * overlay only exists while open.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  /** Screen-reader + visible heading for the dialog. */
  title: string;
  description?: string;
  children: ReactNode;
  /** Extra classes for the panel (max-width etc.). */
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const prevFocus = document.activeElement as HTMLElement | null;

    // Compensate the scrollbar so the page doesn't jump sideways on lock.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    panelRef.current?.focus();
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      prevFocus?.focus?.();
    };
    // NOTE: onClose must be stable across renders for this effect to be
    // cheap; callers pass a setState arrow which React treats as new every
    // render, but the effect body is idempotent so re-runs are harmless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // typeof-document guard: open state is client-only in practice, but a
  // portal into document.body must never run during SSR.
  if (!open || typeof document === "undefined") return null;

  // The portal is what keeps the overlay viewport-anchored: it lifts the
  // dialog out of any transformed (hover-lifted) ancestor card.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop is a separate layer so clicks on it close, clicks inside
          the panel never reach it. Plain dim — see the blur note above. */}
      <div
        className="absolute inset-0 animate-fade-in bg-slate-950/50"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative max-h-[90vh] w-full max-w-md animate-modal-in overflow-y-auto rounded-xl bg-white p-6 shadow-lift focus:outline-none",
          className,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[0.95]"
        >
          <X className="h-4 w-4" />
        </button>

        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}

        {children}
      </div>
    </div>,
    document.body,
  );
}
