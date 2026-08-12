"use client";

import Link from "next/link";
import { SignInFields } from "@/components/auth/AuthFields";
import { BrandMark } from "@/components/ui/BrandMark";

/** Standalone /sign-in page (deep links). The modal version lives in the
 *  auth modal — both share SignInFields. */
export function SignInForm() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-lift">
      <div className="mb-4 flex justify-center">
        <BrandMark size="lg" />
      </div>
      <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
        Welcome back
      </h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Sign in to your Harcourt account.
      </p>
      <SignInFields />
      <p className="mt-6 text-center text-sm text-slate-500">
        New to Harcourt?{" "}
        <Link
          href="/sign-up"
          className="font-semibold text-brand-700 transition hover:text-brand-800"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
