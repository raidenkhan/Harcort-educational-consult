"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Root error boundary.
 *
 * Without this file an exception inside any server action or page reached the
 * user as Next's raw production screen — "500: This page couldn't load" — with
 * no way forward and nothing to report. A tutor hit exactly that while signing
 * in. `reset()` re-renders the segment, so a one-off failure (a slow database,
 * a dropped connection) is recoverable without losing the tab.
 *
 * The digest is shown because it is the only identifier that ties this screen
 * to the server log — the message itself is deliberately not exposed.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-16">
      <Card className="w-full max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          This page hit an unexpected error. Your account and messages are
          unaffected — try again, and if it keeps happening send us the
          reference below.
        </p>
        {error.digest && (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
            Reference: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button type="button" onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-xs transition hover:border-slate-400 hover:bg-slate-50"
          >
            Go to the homepage
          </Link>
        </div>
      </Card>
    </main>
  );
}
