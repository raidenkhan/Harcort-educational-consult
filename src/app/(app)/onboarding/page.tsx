import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";
import { completeOnboardingAction } from "@/services/auth/actions";
import { RolePicker } from "@/components/auth/RolePicker";
import { BrandMark } from "@/components/ui/BrandMark";
import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";

/**
 * One-time onboarding — reached only from the Google callback when the
 * account is brand-new (profiles.onboarding_completed_at is null, 0010).
 * The user picks student or tutor once; completeOnboardingAction stamps the
 * flag so this screen never shows again. Returning users never get here.
 */
export default async function OnboardingPage() {
  const profile = await requireProfile();

  // Already onboarded, or a legacy admin that can't self-pick — move on.
  if (profile.onboarding_completed_at || profile.role === "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="purple" />
      <Container className="flex min-h-[70vh] items-center justify-center py-16">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-lift">
          <div className="mb-4 flex justify-center">
            <BrandMark size="lg" />
          </div>
          <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
            How will you use Harcourt?
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">
            Pick a role to finish setting up your account — you can switch
            later from your dashboard.
          </p>

          <form action={completeOnboardingAction} className="mt-6 space-y-5">
            <RolePicker name="role" legend="I want to join as" />
            <Button type="submit" size="lg" className="w-full">
              Continue
            </Button>
          </form>

          <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
            Tutors set up a profile that needs admin approval before appearing
            in the directory.
          </p>
        </div>
      </Container>
    </div>
  );
}
