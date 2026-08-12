"use client";

import { useState } from "react";
import { useActionState } from "react";
import { ArrowLeftRight, BookOpenCheck, GraduationCap } from "lucide-react";
import { switchRoleAction, type AuthFormState } from "@/services/auth/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Self-service role switch (student ↔ tutor), shown on the dashboard.
 * Two-step confirm so a stray click can't flip the account; the server
 * action revalidates role-driven pages, and the success message is a
 * bonus — the dashboard re-renders with the new role either way.
 */
export function RoleSwitcher({ currentRole }: { currentRole: "student" | "tutor" }) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    switchRoleAction,
    {},
  );

  const target = currentRole === "student" ? "tutor" : "student";
  const Icon = currentRole === "student" ? BookOpenCheck : GraduationCap;
  const heading =
    currentRole === "student" ? "Want to teach?" : "Taking a break from teaching?";
  const blurb =
    currentRole === "student"
      ? "Switch to a tutor account, set up your profile, and get approved to appear in the tutor directory."
      : "Switch to a student account. Your tutor profile is kept but hidden until you switch back.";

  return (
    <Card>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50">
          <Icon className="h-4 w-4 text-brand-700" />
        </span>
        <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
      </div>
      <p className="mt-2 text-sm text-slate-600">{blurb}</p>

      {state?.message && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.message}
        </div>
      )}
      {state?.error && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {confirming ? (
        <form action={formAction} className="mt-4">
          <input type="hidden" name="role" value={target} />
          <div className="flex flex-col gap-2.5 sm:flex-row">
            {/* autoFocus keeps keyboard users' place when the button swaps to
                the confirm form (the mount-triggered focus lands on submit). */}
            <Button type="submit" autoFocus disabled={pending} className="flex-1">
              {pending ? "Switching…" : `Yes, switch to ${target}`}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" className="mt-4" onClick={() => setConfirming(true)}>
          <ArrowLeftRight className="h-4 w-4" />
          Switch to {target}
        </Button>
      )}
    </Card>
  );
}
