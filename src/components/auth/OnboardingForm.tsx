"use client";

import { completeOnboardingAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { RolePicker } from "./RolePicker";

/**
 * The one-time Google onboarding form (0010). Picks the role only — the
 * session format (one-on-one vs group) is asked at booking time, when a
 * student requests a tutor, not during registration.
 *
 * `next` carries a deep link through the role pick: a brand-new Google user
 * who arrived from a tutor share link still lands on that course afterwards,
 * instead of being dumped on the dashboard. The action validates it with
 * `safeNextPath`.
 */
export function OnboardingForm({ next }: { next?: string | null }) {
  return (
    <form action={completeOnboardingAction} className="mt-6 space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <RolePicker name="role" legend="I want to join as" />

      <Button type="submit" size="lg" className="w-full">
        Continue
      </Button>
    </form>
  );
}
