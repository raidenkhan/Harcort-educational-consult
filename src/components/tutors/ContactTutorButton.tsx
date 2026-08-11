"use client";

import { useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import {
  startConversation,
  type ConversationFormState,
} from "@/services/chat/mutations";
import { cn } from "@/lib/cn";

/**
 * Session-aware "Contact tutor" CTA.
 *
 * - Signed out → opens the auth modal (create account / sign in).
 * - Signed in  → starts (or re-enters) the conversation with this tutor and
 *   lands the student in /chat, where both sides can message each other.
 */
export function ContactTutorButton({
  tutorProfileId,
  signedIn,
  className,
}: {
  tutorProfileId: string;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ConversationFormState, FormData>(
    startConversation,
    {},
  );

  useEffect(() => {
    if (state?.ok && state.conversationId) {
      router.push(`/chat?c=${state.conversationId}`);
    }
  }, [state, router]);

  if (!signedIn) {
    return (
      <AuthTrigger tab="sign-up" className={className}>
        Contact tutor
      </AuthTrigger>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="tutorProfileId" value={tutorProfileId} />
      <button
        type="submit"
        disabled={pending}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-xs font-semibold text-white shadow-xs transition duration-150 hover:bg-slate-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {pending ? "Starting…" : "Contact tutor"}
      </button>
      {state?.error && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
