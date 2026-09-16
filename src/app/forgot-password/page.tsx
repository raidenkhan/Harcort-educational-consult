import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { BrandMark } from "@/components/ui/BrandMark";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { FloatingNav } from "@/components/navigation/FloatingNav";

export const metadata = {
  title: "Forgot password",
  description:
    "Reset your Harcourt password — we'll email you a one-time code. No admin needed.",
};

export default function ForgotPasswordPage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <BentoBackdrop tone="purple" className="-z-10" />

      <FloatingNav links={[{ href: "/", label: "Home" }]}>
        <Link
          href="/sign-in"
          className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-slate-700 transition duration-150 hover:bg-slate-100"
        >
          Back to sign in
        </Link>
      </FloatingNav>

      <main className="relative flex flex-1 items-center pb-14 pt-28">
        <Container size="narrow">
          <Card className="mx-auto w-full max-w-md">
            <div className="mb-4 flex justify-center">
              <BrandMark size="lg" />
            </div>
            <h1 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">
              Reset your password
            </h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              Enter your email and we&apos;ll send you a one-time reset code — no
              admin needed. Codes expire after 30 minutes.
            </p>
            <ForgotPasswordForm />
          </Card>
        </Container>
      </main>
    </div>
  );
}
