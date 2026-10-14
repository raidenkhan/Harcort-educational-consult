"use client";

import { useState } from "react";
import { completeOnboardingAction } from "@/services/auth/actions";
import { Button } from "@/components/ui/Button";
import { RolePicker, type AuthRole } from "./RolePicker";
import { SessionModePicker } from "./SessionModePicker";

/**
 * The one-time Google onboarding form (0010), plus the session-format
 * question (0021) for students — so a Google account answers the same two
 * things as an email sign-up. Client-side so the format picker can appear
 * only once "I'm a student" is selected; the role radios stay uncontrolled.
 */
export function OnboardingForm() {
  const [role, setRole] = useState<AuthRole>("student");

  return (
    <form action={completeOnboardingAction} className="mt-6 space-y-5">
      <RolePicker name="role" legend="I want to join as" onChange={setRole} />

      {role === "student" && (
        <SessionModePicker hint="You can change this later from your dashboard." />
      )}

      <Button type="submit" size="lg" className="w-full">
        Continue
      </Button>
    </form>
  );
}
