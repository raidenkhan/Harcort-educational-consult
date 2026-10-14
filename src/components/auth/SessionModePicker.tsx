"use client";

import { User, Users } from "lucide-react";
import { cn } from "@/lib/cn";
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
  defaultMode = "one_on_one",
  legend = "How do you want your sessions?",
  hint,
  onChange,
}: {
  name?: string;
  defaultMode?: SessionMode;
  legend?: string;
  hint?: string;
  onChange?: (mode: SessionMode) => void;
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-700">{legend}</legend>
      <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-label={legend}>
        {SESSION_MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              "cursor-pointer rounded-md border border-slate-200 p-3.5 transition",
              "has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/60 has-[:checked]:ring-2 has-[:checked]:ring-brand-600/15",
              "hover:border-slate-300",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultMode}
              className="sr-only"
              onChange={(e) => {
                if (e.target.checked) onChange?.(option.value);
              }}
            />
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50">
              <option.icon className="h-5 w-5 text-brand-700" />
            </span>
            <span className="mt-2 block text-sm font-semibold text-slate-900">
              {option.title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-500">
              {option.description}
            </span>
          </label>
        ))}
      </div>
      {hint && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
      )}
    </fieldset>
  );
}
