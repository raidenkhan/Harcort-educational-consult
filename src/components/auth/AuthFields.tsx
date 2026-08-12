"use client";

import { useActionState } from "react";
import Link from "next/link";
import { GraduationCap, BookOpenCheck } from "lucide-react";
import { signInAction, signUpAction, type AuthFormState } from "@/services/auth/actions";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { GoogleAuthBlock } from "./GoogleAuthBlock";
import { cn } from "@/lib/cn";

/**
 * Shared auth forms — rendered inside both the auth modal (with tabs)
 * and the standalone /sign-in and /sign-up pages.
 */

export function SignInFields() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signInAction,
    {},
  );

  return (
    <>
      {state?.message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.message}
        </div>
      )}
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <GoogleAuthBlock variant="sign-in" />

      <form action={formAction} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>
        <div className="flex items-center justify-end">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-brand-700 transition hover:text-brand-800"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </>
  );
}

const ROLES = [
  {
    value: "student",
    title: "I'm a student",
    description: "Find a tutor for your courses",
    icon: GraduationCap,
  },
  {
    value: "tutor",
    title: "I'm a tutor",
    description: "Offer services, get approved",
    icon: BookOpenCheck,
  },
] as const;

export function SignUpFields() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpAction,
    {},
  );

  return (
    <>
      {state?.message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {state.message}
        </div>
      )}
      {state?.error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <GoogleAuthBlock variant="sign-up" />

      <form action={formAction} className="space-y-4">
        <Field label="Full name" htmlFor="fullName">
          <Input
            id="fullName"
            name="fullName"
            type="text"
            required
            autoComplete="name"
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-700">
            I want to join as
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {ROLES.map((role) => (
              <label
                key={role.value}
                className={cn(
                  "cursor-pointer rounded-md border border-slate-200 p-3.5 transition",
                  "has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/60 has-[:checked]:ring-2 has-[:checked]:ring-brand-600/15",
                  "hover:border-slate-300",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={role.value}
                  required
                  defaultChecked={role.value === "student"}
                  className="sr-only"
                />
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50">
                  <role.icon className="h-5 w-5 text-brand-700" />
                </span>
                <span className="mt-2 block text-sm font-semibold text-slate-900">
                  {role.title}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  {role.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </>
  );
}
