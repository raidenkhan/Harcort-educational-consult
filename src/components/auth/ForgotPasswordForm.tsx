"use client";

import { useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import {
  redeemResetCode,
  requestResetCode,
  type ResetFormState,
} from "@/services/auth/passwordReset";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";

/**
 * Forgot-password — two steps.
 *
 * Step 1: enter your email → the one-time code is emailed automatically
 * (self-service, no admin needed). Step 2: enter the code + a new password.
 * Someone whose admin already shared a code (no-email fallback) can skip
 * straight to step 2 via the link. No session needed — the user is locked
 * out by definition.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"request" | "redeem">("request");

  const [requestState, requestAction, requestPending] = useActionState<
    ResetFormState,
    FormData
  >(requestResetCode, {});
  const [redeemState, redeemAction, redeemPending] = useActionState<
    ResetFormState,
    FormData
  >(redeemResetCode, {});

  const success = Boolean(redeemState?.message);
  // Auto-advance to the redeem step once a code has been requested.
  const showRedeem = mode === "redeem" || Boolean(requestState?.message);

  return (
    <>
      {success ? (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
          <p className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {redeemState.message} All your old sessions have been signed out.
            </span>
          </p>
          <Link href="/sign-in" className="mt-3 inline-block">
            <Button>Sign in with your new password</Button>
          </Link>
        </div>
      ) : (
        <>
          {(requestState?.error || redeemState?.error) && (
            <div
              className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {requestState?.error ?? redeemState?.error}
            </div>
          )}

          {showRedeem ? (
            /* ------------------------- Step 2: redeem ---------------------- */
            <>
              <form action={redeemAction} className="mt-5 space-y-4">
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    defaultValue={email}
                    readOnly={Boolean(requestState?.message)}
                  />
                </Field>
                <Field
                  label="Reset code"
                  htmlFor="code"
                  hint={
                    requestState?.message
                      ? "We emailed you an 8-digit code — it expires in 30 minutes."
                      : "The 8-digit code your admin shared with you"
                  }
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
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={redeemPending}
                >
                  {redeemPending ? "Resetting…" : "Reset password"}
                </Button>
              </form>

              <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-slate-500">
                <MailCheck className="h-4 w-4" />
                {requestState?.message
                  ? "Code didn't arrive? Check spam, or ask your admin for one."
                  : "No code yet? Ask your admin for one."}
              </p>
            </>
          ) : (
            /* ------------------------ Step 1: request ---------------------- */
            <>
              <form action={requestAction} className="mt-5 space-y-4">
                <Field
                  label="Email"
                  htmlFor="request-email"
                  hint="We'll email you an 8-digit reset code."
                >
                  <Input
                    id="request-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={requestPending}
                >
                  {requestPending ? "Sending…" : "Send me a reset code"}
                </Button>
              </form>

              <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-slate-500">
                <KeyRound className="h-4 w-4" />
                Already have a code?{" "}
                <button
                  type="button"
                  onClick={() => setMode("redeem")}
                  className="font-semibold text-brand-700 underline-offset-2 hover:underline"
                >
                  Enter it here
                </button>
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
