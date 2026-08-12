import Image from "next/image";

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
      {/* The card's BrandMark + heading are the brand anchor here. */}
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
