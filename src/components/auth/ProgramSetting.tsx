"use client";

import Link from "next/link";
import { useActionState } from "react";
import { GraduationCap } from "lucide-react";
import { setProgramAction, type AuthFormState } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * Settings → Programme. The programme a student studies — their account is
 * associated with it, and Dashboard → Courses shows that programme's courses
 * and tutors. Keyed by the parent on the saved value, so a save remounts it.
 */
export function ProgramSetting({
  programs,
  current,
}: {
  programs: string[];
  current: string | null;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    setProgramAction,
    {},
  );

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <GraduationCap className="h-5 w-5 text-brand-600" aria-hidden="true" />
        Your programme
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        The programme you study. Your Courses page shows its courses and the
        tutors who teach them.
      </p>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Programme</span>
          <select
            name="program"
            defaultValue={current ?? ""}
            required
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
          >
            <option value="" disabled>
              Choose your programme
            </option>
            {programs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? "Saving…" : current ? "Update" : "Save"}
        </Button>
      </form>

      {state?.error && (
        <p className="mt-2 text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p className="mt-2 text-xs font-medium text-emerald-700" role="status">
          {state.message}{" "}
          <Link href="/dashboard/courses" className="font-semibold underline underline-offset-2">
            See your courses
          </Link>
        </p>
      )}
    </Card>
  );
}
