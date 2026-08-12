"use client";

import { GraduationCap, BookOpenCheck } from "lucide-react";
import { cn } from "@/lib/cn";

export const AUTH_ROLES = [
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

export type AuthRole = (typeof AUTH_ROLES)[number]["value"];

/**
 * Student / tutor role picker — the same two cards used by the email
 * sign-up form (plain radios under `name`) and the Google sign-up block
 * (read through `onChange`, no form involved).
 *
 * Radios are uncontrolled; `defaultChecked` only seeds the initial state,
 * and the highlight comes from the native `:checked` pseudo-class, so
 * parent re-renders never reset the user's selection.
 */
export function RolePicker({
  name,
  defaultRole = "student",
  onChange,
  legend = "I want to join as",
}: {
  name?: string;
  defaultRole?: AuthRole;
  onChange?: (role: AuthRole) => void;
  legend?: string;
}) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-slate-700">
        {legend}
      </legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {AUTH_ROLES.map((role) => (
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
              name={name}
              value={role.value}
              defaultChecked={role.value === defaultRole}
              required
              className="sr-only"
              onChange={(e) => {
                if (e.target.checked) onChange?.(role.value);
              }}
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
  );
}
