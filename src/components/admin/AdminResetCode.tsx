"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import {
  generateResetCode,
  type ResetFormState,
} from "@/services/auth/passwordReset";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Admin tool: issue a one-time password-reset code for a student who forgot
 * their password. The code is shown once so the admin can share it out-of-band
 * (WhatsApp / phone). Codes are single-use and expire in 30 minutes.
 */
export function AdminResetCode() {
  const [state, formAction, pending] = useActionState<ResetFormState, FormData>(
    generateResetCode,
    {},
  );
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!state?.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code is still on screen */
    }
  };

  return (
    <Card className="max-w-xl">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand-50">
          <KeyRound className="h-5 w-5 text-brand-700" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            Password reset codes
          </h3>
          <p className="mt-0.5 text-sm text-slate-600">
            Generate a one-time code for a student who forgot their password,
            then share it with them (WhatsApp / phone). Codes expire in 30
            minutes and can only be used once.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 flex gap-2">
        <Input
          name="email"
          type="email"
          required
          autoComplete="off"
          placeholder="Student's email"
          aria-label="Student's email"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={pending} className="shrink-0">
          {pending ? "Generating…" : "Generate code"}
        </Button>
      </form>

      {state?.error && (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}

      {state?.code && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Share this one-time code
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <code className="font-display text-2xl font-bold tracking-[0.3em] text-slate-900">
              {state.code}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 shadow-xs transition hover:bg-amber-100 active:scale-[0.97]"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-amber-800">
            Single use · expires in 30 minutes · redeeming it signs the student
            out everywhere.
          </p>
        </div>
      )}
    </Card>
  );
}
