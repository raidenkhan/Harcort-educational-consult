"use client";

import { completeOnboardingAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { RolePicker } from "./RolePicker";

/**
 * The one-time Google onboarding form (0010). Picks the role only — the
 * session format (one-on-one vs group) is asked at booking time, when a
 * student requests a tutor, not during registration.
 */
export function OnboardingForm() {
  return (
    <form action={completeOnboardingAction} className="mt-6 space-y-5">
      <RolePicker name="role" legend="I want to join as" />

      <Button type="submit" size="lg" className="w-full">
        Continue
      </Button>
    </form>
  );
}
