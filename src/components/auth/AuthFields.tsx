"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signInAction, signUpAction, type AuthFormState } from "@/services/auth/actions";
import { ENGINEERING_FIELDS, YEARS } from "@/components/home/courseTaxonomy";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Fields";
import { Button } from "@/components/ui/Button";
import { GoogleAuthBlock } from "./GoogleAuthBlock";
import { RolePicker, type AuthRole } from "./RolePicker";

/** Shared auth forms — rendered inside both the auth modal (with tabs)
 * and the standalone /sign-in and /sign-up pages.
 */

/** Matches StudyPrefsPicker's select styling so the two program pickers read
 *  as the same control. */
const selectClass =
  "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15";

/** Sign-in form. */
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

      <GoogleAuthBlock />

      <form action={formAction} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
          />
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

/** Sign-up form — students see program + year + phone; tutors see only role
 *  and basic fields. The session format (one-on-one vs group) is chosen at
 *  booking time, not here.
 */
export function SignUpFields() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signUpAction,
    {},
  );
  // Tracked only to reveal the student-only fields (program/year): the role
  // radios themselves stay uncontrolled, so this never resets them.
  const [role, setRole] = useState<AuthRole>("student");

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

      <GoogleAuthBlock />

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

        <RolePicker name="role" onChange={setRole} />

        {/* Program + year are required for students (Program → Year → Course).
            Selects, not free text: the value is written to profiles.program and
            matched against courses.subject, so it must be one of the KNUST
            engineering fields the catalog uses. */}
        {role === "student" && (
          <>
            <Field label="Program" htmlFor="program">
              <select
                id="program"
                name="program"
                required
                defaultValue=""
                className={selectClass}
              >
                <option value="" disabled>
                  Choose your program
                </option>
                {ENGINEERING_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Year" htmlFor="year">
              <select
                id="year"
                name="year"
                required
                defaultValue=""
                className={selectClass}
              >
                <option value="" disabled>
                  Choose your year
                </option>
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    Year {year}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {/* Phone is optional for every role. Students get session texts
            (Arkesel SMS, 0022); the number can be added or cleared later from
            the dashboard. */}
        <Field
          label="Phone number (optional)"
          htmlFor="phone"
          hint="Ghana mobile — used for session text updates."
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="e.g. 0241234567"
          />
        </Field>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </>
  );
}
