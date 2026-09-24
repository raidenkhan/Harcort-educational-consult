"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The app's one dialog primitive — every popup goes through this so the
 * a11y + behaviour can never drift between call sites:
 *
 *  - body scroll locks while open (the page behind can't scroll — this was
 *    the cause of the "glitching" overlay: the FloatingNav + gradient
 *    backdrop re-rendered on every scroll frame behind the dialog)
 *  - Escape closes via a document listener (works even if focus is elsewhere,
 *    e.g. right after opening, before the user tabs in)
 *  - focus moves into the panel on open, restored on close
 *  - backdrop click closes; clicks inside the panel never bubble to it
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
    const prevFocus = document.activeElement as HTMLElement | null;

    panelRef.current?.focus();
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop is a separate layer so clicks on it close, clicks inside
          the panel never reach it. */}
      <div
        className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm"
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
    </div>
  );
}
