"use client";

import { User, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import { priceTag } from "@/components/tutors/ServicePrice";
import type { SessionMode } from "@/services/auth/sessionFormat";

/**
 * Session format picker — one-on-one or group (0021).
 *
 * The same two cards are used at sign-up (inside the email form and the
 * Google onboarding screen) and on the student dashboard. Radios are
 * uncontrolled; the highlight comes from the native `:checked`
 * pseudo-class, so a parent re-render never resets the selection — the same
 * contract as `RolePicker`.
 */

export const SESSION_MODE_OPTIONS = [
  {
    value: "one_on_one",
    title: "One-on-one",
    description: "Just you and your tutor, working at your own pace.",
    icon: User,
  },
  {
    value: "group",
    title: "Group sessions",
    description: "Learn alongside classmates on the same course.",
    icon: Users,
  },
] as const satisfies ReadonlyArray<{
  value: SessionMode;
  title: string;
  description: string;
  icon: typeof User;
}>;

export function SessionModePicker({
  name = "sessionMode",
  value,
  defaultMode = "one_on_one",
  legend = "How do you want your sessions?",
  hint,
  disabledModes,
  prices,
  onChange,
}: {
  name?: string;
  /** Controlled mode: the currently selected value. If provided, overrides defaultMode. */
  value?: SessionMode;
  defaultMode?: SessionMode;
  legend?: string;
  hint?: string;
  /** Formats the tutor does not offer for the chosen course (0031). A
   *  disabled radio still submits nothing, so the caller must also pick a
   *  valid `defaultMode` — see RequestTutorButton. */
  disabledModes?: readonly SessionMode[];
  /** The fee for each format (whole cedis, per semester). Showing the price ON
   *  the choice is what stops a student picking "Group" and then being
   *  surprised by (or charged) the solo price — the number they see and the
   *  number the paywall charges are the same field. */
  prices?: Partial<Record<SessionMode, number | null>>;
  onChange?: (mode: SessionMode) => void;
}) {
  const selectedMode = value ?? defaultMode;
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-700">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-label={legend}>
        {SESSION_MODE_OPTIONS.map((option) => {
          const disabled = disabledModes?.includes(option.value) ?? false;
          const isChecked = selectedMode === option.value;
          const price = prices?.[option.value] ?? null;
          return (
            <label
              key={option.value}
              className={cn(
                "cursor-pointer rounded-md border border-slate-200 p-3.5 transition focus-within:ring-2 focus-within:ring-brand-600/40 focus-within:ring-offset-2",
                isChecked && !disabled &&
                  "border-brand-600 bg-brand-50/60 ring-2 ring-brand-600/15",
                !disabled && "hover:border-slate-300",
                disabled &&
                  "cursor-not-allowed opacity-50 hover:border-slate-200",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={isChecked}
                disabled={disabled}
                className="sr-only"
                onChange={() => {
                  if (!disabled) onChange?.(option.value);
                }}
              />
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50">
                <option.icon className="h-5 w-5 text-brand-700" aria-hidden="true" />
              </span>
              <span className="mt-2 block text-sm font-semibold text-slate-900">
                {option.title}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                {disabled
                  ? "Not offered for this course."
                  : option.description}
              </span>
              {!disabled && price !== null && (
                <span
                  className={cn(
                    "mt-2 block text-sm font-bold",
                    isChecked ? "text-brand-800" : "text-slate-700",
                  )}
                >
                  {priceTag(price)}
                  <span className="ml-1 text-[11px] font-normal text-slate-500">
                    /semester
                  </span>
                </span>
              )}
            </label>
          );
        })}
      </div>
      {hint && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
      )}
    </fieldset>
  );
}
