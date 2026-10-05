"use client";

import { useActionState } from "react";
import { setStudyPrefsAction, type AuthFormState } from "@/services/auth/actions";
import { YEARS } from "@/components/home/courseTaxonomy";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Study-preferences picker — a student chooses the program they study and the
 * year they're in (Program → Year → Course). The parent keys it on the current
 * selection so a save remounts it with fresh values; the section above is the
 * success signal, so only errors need inline surfacing here.
 */
export function StudyPrefsPicker({
  programs,
  currentProgram,
  currentYear,
  className,
}: {
  programs: string[];
  currentProgram: string | null;
  currentYear: number | null;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    setStudyPrefsAction,
    {},
  );

  const selectClass =
    "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-xs transition focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15";

  return (
    <form
      action={formAction}
      className={cn("flex flex-wrap items-end gap-3", className)}
    >
      <label className="min-w-0 flex-1 sm:max-w-xs">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Program
        </span>
        <select
          name="program"
          defaultValue={currentProgram ?? ""}
          required
          className={selectClass}
        >
          <option value="" disabled>
            Choose your program
          </option>
          {programs.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0 flex-1 sm:w-40 sm:flex-none">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Year
        </span>
        <select
          name="year"
          defaultValue={currentYear?.toString() ?? ""}
          className={selectClass}
        >
          <option value="">Any year</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>
      </label>

      <Button type="submit" disabled={pending} className="h-10">
        {pending ? "Saving…" : currentProgram ? "Update" : "Save"}
      </Button>

      {state?.error && (
        <p className="w-full text-xs font-medium text-red-600" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
