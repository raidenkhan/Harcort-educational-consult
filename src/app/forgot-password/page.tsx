import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Logo } from "@/components/ui/Logo";
import { BrandMark } from "@/components/ui/BrandMark";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";

export const metadata = {
  title: "Forgot password",
  description:
    "Reset your Harcourt password with the one-time code your admin shared with you.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <BentoBackdrop tone="amber" />

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <Logo />
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-slate-700 transition hover:text-slate-900"
          >
            Back to sign in
          </Link>
        </Container>
      </header>

      <main className="relative flex flex-1 items-center py-14">
        <Container size="narrow">
          <Card className="mx-auto w-full max-w-md">
            <div className="mb-4 flex justify-center">
              <BrandMark size="lg" />
            </div>
            <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
              Reset your password
            </h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              Enter the one-time code your admin shared with you, along with
              your new password. Codes expire after 30 minutes.
            </p>
            <ForgotPasswordForm />
          </Card>
        </Container>
      </main>
    </div>
  );
}
