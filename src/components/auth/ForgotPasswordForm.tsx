"use client";

import { useActionState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";
import {
  redeemResetCode,
  type ResetFormState,
} from "@/services/auth/passwordReset";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";

/**
 * Forgot-password redemption: the student enters the one-time code their
 * admin shared with them (WhatsApp / phone) plus a new password. No session
 * needed — the user is locked out by definition.
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ResetFormState, FormData>(
    redeemResetCode,
    {},
  );

  const success = Boolean(state?.message);

  return (
    <>
      {success ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {state.message} All your old sessions have been signed out.
            </span>
          </p>
          <Link href="/sign-in" className="mt-3 inline-block">
            <Button>Sign in with your new password</Button>
          </Link>
        </div>
      ) : (
        <>
          {state?.error && (
            <div
              className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {state.error}
            </div>
          )}

          <form action={formAction} className="mt-5 space-y-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
              />
            </Field>
            <Field
              label="Reset code"
              htmlFor="code"
              hint="The 8-digit code your admin shared with you"
            >
              <Input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{8}"
                maxLength={8}
                required
                autoComplete="one-time-code"
                placeholder="12345678"
              />
            </Field>
            <Field
              label="New password"
              htmlFor="password"
              hint="At least 8 characters"
            >
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "Resetting…" : "Reset password"}
            </Button>
          </form>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-slate-500">
            <KeyRound className="h-4 w-4" />
            No code yet? Contact your admin — they can issue one for you.
          </p>
        </>
      )}
    </>
  );
}
