import Image from "next/image";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <Image
        src="/gradback.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-white/25"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
