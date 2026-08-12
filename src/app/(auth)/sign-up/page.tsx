"use client";

import Link from "next/link";
import { SignUpFields } from "@/components/auth/AuthFields";
import { BrandMark } from "@/components/ui/BrandMark";

export default function SignUpPage() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-lift">
      <div className="mb-4 flex justify-center">
        <BrandMark size="lg" />
      </div>
      <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
        Create your account
      </h1>
      <p className="mt-1 text-center text-sm text-slate-500">
        Join Harcourt as a student or a tutor.
      </p>
      <SignUpFields />
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="font-semibold text-brand-700 transition hover:text-brand-800"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
