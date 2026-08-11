"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import {
  startAdminConversation,
  type ConversationFormState,
} from "@/services/chat/mutations";
import type { ChatTarget } from "@/services/chat/queries";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";

/**
 * Admin-only "New message" panel for /chat. Picks a student or an approved
 * tutor and starts (or re-enters) the conversation — the admin side of a
 * thread is marked with the verified badge in ChatView.
 */
export function AdminNewConversation({ targets }: { targets: ChatTarget[] }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ConversationFormState, FormData>(
    startAdminConversation,
    {},
  );
  const [targetType, setTargetType] = useState<"student" | "tutor">("student");

  const students = targets.filter((t) => t.type === "student");
  const tutors = targets.filter((t) => t.type === "tutor");
  const list = targetType === "student" ? students : tutors;

  useEffect(() => {
    if (state?.ok && state.conversationId) {
      router.push(`/chat?c=${state.conversationId}`);
    }
  }, [state, router]);

  return (
    <Card className="mt-8">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-petrol-50">
          <MessageSquarePlus className="h-4 w-4 text-petrol-700" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            New message <VerifiedBadge className="ml-1 align-[-1px]" />
          </h2>
          <p className="text-xs text-slate-500">
            Reach a student or tutor directly — your messages carry the
            verified Harcot badge.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select
          name="targetType"
          value={targetType}
          onChange={(e) =>
            setTargetType(e.target.value === "tutor" ? "tutor" : "student")
          }
          aria-label="Who to message"
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15 sm:w-40"
        >
          <option value="student">Students</option>
          <option value="tutor">Tutors</option>
        </select>

        <select
          name="targetId"
          required
          key={targetType}
          defaultValue=""
          aria-label="Pick someone"
          className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
        >
          <option value="" disabled>
            {targetType === "student" ? "Choose a student…" : "Choose a tutor…"}
          </option>
          {list.map((t) => (
            <option key={`${t.type}-${t.id}`} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <Button
          type="submit"
          disabled={pending}
          className="h-10 shrink-0 px-5"
        >
          {pending ? "Starting…" : "Start conversation"}
        </Button>
      </form>

      {state?.error && (
        <p className="mt-3 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </Card>
  );
}
