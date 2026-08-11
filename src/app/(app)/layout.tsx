import Link from "next/link";
import { getCurrentProfile } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Logo } from "@/components/ui/Logo";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";

const roleTone = {
  student: "neutral",
  tutor: "petrol",
  admin: "amber",
} as const;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    ...(profile?.role === "student" || profile?.role === "tutor"
      ? [{ href: "/chat", label: "Messages" }]
      : []),
    ...(profile?.role === "tutor"
      ? [{ href: "/tutor", label: "My tutor profile" }]
      : []),
    ...(profile?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <Container className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {profile && (
              <span className="hidden items-center gap-2 text-sm text-slate-600 lg:flex">
                {profile.full_name}
                {profile.role === "admin" && <VerifiedBadge />}
                <Badge tone={roleTone[profile.role]}>{profile.role}</Badge>
              </span>
            )}
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-xs transition hover:border-slate-400 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </Container>
      </header>
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>

      {/* Mobile gets an app-like bottom tab bar; lg+ uses the top nav. */}
      {profile && <MobileTabBar role={profile.role} />}
    </div>
  );
}
