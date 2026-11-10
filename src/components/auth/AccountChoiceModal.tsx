"use client";

import { LogIn, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useAuthModal } from "@/components/auth/AuthModal";

/**
 * "Do you have a Harcourt account?" — shown when a signed-out visitor taps
 * Make payment. Payment needs an account (the booking, receipts, sessions and
 * tutor chat all live in it), but the button says "Make payment", not "Sign
 * in to pay": the visitor answers one question and lands on the right form —
 * sign in if they have an account, sign up if they don't — and both return
 * to `next` (the cart, where their selection is waiting).
 */
export function AccountChoiceModal({
  open,
  onClose,
  next,
}: {
  open: boolean;
  onClose: () => void;
  /** Where to land after signing in or up (default: the cart). */
  next?: string;
}) {
  const { open: openAuth } = useAuthModal();

  function choose(tab: "sign-in" | "sign-up") {
    onClose();
    openAuth(tab, next ?? "/cart");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Do you have a Harcourt account?"
      description="Your booking, receipts, sessions and tutor chat are kept in your account. Your selection is saved — you'll come straight back to pay."
      className="max-w-md"
    >
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => choose("sign-in")}
          className="flex flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-brand-300 hover:bg-brand-50"
        >
          <LogIn className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <span className="mt-1 text-sm font-semibold text-slate-900">Yes, I have one</span>
          <span className="text-xs text-slate-500">Sign in and pay</span>
        </button>
        <button
          type="button"
          onClick={() => choose("sign-up")}
          className="flex flex-col items-start gap-1 rounded-lg border border-brand-200 bg-brand-50 p-4 text-left transition hover:border-brand-400"
        >
          <UserPlus className="h-5 w-5 text-brand-600" aria-hidden="true" />
          <span className="mt-1 text-sm font-semibold text-slate-900">No, I&apos;m new</span>
          <span className="text-xs text-slate-500">Create an account in a minute, then pay</span>
        </button>
      </div>
    </Modal>
  );
}
