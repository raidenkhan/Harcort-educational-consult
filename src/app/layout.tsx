import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import { AuthModalProvider } from "@/components/auth/AuthModal";
import {
  SITE_NAME,
  SITE_URL,
  SITE_DESCRIPTION,
  SITE_TAGLINE,
} from "@/lib/site";
import "./globals.css";

/**
 * Site-wide metadata — all identity values come from lib/site.ts so the
 * canonical URL, OG tags and JSON-LD can never disagree.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Tutors & Free Lessons for KNUST Engineering`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "tutor",
    "tutors Ghana",
    "KNUST",
    "KNUST engineering",
    "engineering mechanics",
    "theory of machines",
    "engineering mathematics",
    "Harcourt University",
    "Harcourt Educational Consult",
  ],
  applicationName: SITE_NAME,
  // The landing page is the one true canonical for the root; /tutors and
  // forgot-password set their own. App pages are noindex (see robots).
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: `${SITE_NAME} — Tutors & Free Lessons for KNUST Engineering`,
    description: SITE_TAGLINE,
    locale: "en_GH",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Tutors & Free Lessons for KNUST`,
    description: SITE_TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "education",
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
