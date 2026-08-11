"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { GraduationCap, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Popup for tutors who haven't set up their profile yet: they must create
 * one before they can undergo review and acceptance. Shows once per browser
 * session on the dashboard (dismissal is remembered via sessionStorage) and
 * disappears entirely once a profile exists.
 *
 * The dismissed flag is read through useSyncExternalStore (same pattern as
 * AuthModal): the server snapshot pretends it's dismissed, so the modal never
 * renders in server HTML and there's no hydration mismatch when the client
 * finds the flag set.
 */
const DISMISS_KEY = "harcot:tutor-profile-cta";

const dismissListeners = new Set<() => void>();

function readDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return true;
  }
}

function subscribeToDismiss(callback: () => void) {
  dismissListeners.add(callback);
  return () => {
    dismissListeners.delete(callback);
  };
}

/** Client snapshot: the real flag. */
function getDismissedSnapshot(): boolean {
  return readDismissed();
}

/** Server snapshot: treated as dismissed so the modal stays out of SSR HTML. */
function getDismissedServerSnapshot(): boolean {
  return true;
}

function markDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage unavailable — ignore */
  }
  dismissListeners.forEach((listener) => listener());
}

export function TutorProfileCta({ hasProfile }: { hasProfile: boolean }) {
  const dismissed = useSyncExternalStore(
    subscribeToDismiss,
    getDismissedSnapshot,
    getDismissedServerSnapshot,
  );
  const panelRef = useRef<HTMLDivElement>(null);

  const open = !hasProfile && !dismissed;

  // Focus the panel, close on Escape, lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") markDismissed();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutor-profile-cta-title"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm"
        onClick={markDismissed}
        aria-hidden="true"
      />

      {/* panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-md animate-modal-in overflow-hidden rounded-xl bg-white p-6 shadow-lift focus:outline-none"
      >
        <button
          type="button"
          onClick={markDismissed}
          aria-label="Dismiss"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[0.95]"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-50">
          <GraduationCap className="h-5 w-5 text-brand-700" />
        </span>

        <h2
          id="tutor-profile-cta-title"
          className="mt-4 font-display text-2xl font-bold tracking-tight text-slate-900"
        >
          Create your tutor profile
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Before you can undergo review and acceptance, you need to set up your
          tutor profile — tell students who you are, your qualifications and
          your rates. Once our team approves it, you&apos;ll appear in the
          tutor directory and students will be able to contact you.
        </p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <Link href="/tutor" className="flex-1">
            <Button className="w-full">Set up tutor profile</Button>
          </Link>
          <Button variant="secondary" onClick={markDismissed} className="flex-1">
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
