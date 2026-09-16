import { AnimatedGradient } from "@/components/ui/AnimatedGradient";

/**
 * Auth pages (sign-in / sign-up / forgot-password) sit on the animated
 * gradient so they match the landing hero, with the white card as the
 * contrast anchor.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <AnimatedGradient />
      {/* The card's BrandMark + heading are the brand anchor here. */}
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
