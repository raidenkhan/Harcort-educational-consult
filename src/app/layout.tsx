import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import { AuthModalProvider } from "@/components/auth/AuthModal";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Harcot Educational Consult",
    template: "%s · Harcot Educational Consult",
  },
  description:
    "Find expert tutors for the courses you need. Verified educators, one-to-one guidance, and learning that moves at your pace.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-canvas text-slate-800">
        <AuthModalProvider>{children}</AuthModalProvider>
      </body>
    </html>
  );
}
