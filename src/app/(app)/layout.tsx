import { Suspense, cache } from "react";
import Link from "next/link";
import { getCurrentProfile, profileIsAdmin } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { Logo } from "@/components/ui/Logo";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Cached profile lookup — deduplicates across the two Suspense boundaries
 * (header + tab bar) so we only hit Supabase once per request.
 */
const getProfile = cache(() => getCurrentProfile());

const roleTone = {
  student: "neutral",
  tutor: "petrol",
  admin: "amber",
} as const;

/* ------------------------------------------------------------------ */
/*  Shell skeletons — instant visual feedback while data streams in    */
/* ------------------------------------------------------------------ */

function HeaderSkeleton() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-28" />
        </div>
        <div className="hidden items-center gap-6 lg:flex">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-8 w-16 rounded-md" />
      </Container>
    </header>
  );
}

function TabBarSkeleton() {
  return (
    <nav
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden [padding-bottom:env(safe-area-inset-bottom)]"
    >
      <div className="flex h-16">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center justify-center gap-1 pt-2.5"
          >
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        ))}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Async shell components — each in its own Suspense boundary         */
/* ------------------------------------------------------------------ */

async function AppHeader() {
  const profile = await getProfile();

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    ...(profile?.role === "student" || profile?.role === "tutor"
      ? [{ href: "/chat", label: "Messages" }]
      : []),
    ...(profile?.role === "tutor"
      ? [{ href: "/tutor", label: "My tutor profile" }]
      : []),
    ...(profile && profileIsAdmin(profile)
      ? [{ href: "/admin", label: "Admin" }]
      : []),
  ];

  return (
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
              {profileIsAdmin(profile) && <VerifiedBadge />}
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
  );
}

async function AppTabBar() {
  const profile = await getProfile();
  if (!profile) return null;
  return <MobileTabBar role={profile.role} isAdmin={profileIsAdmin(profile)} />;
}

/* ------------------------------------------------------------------ */
/*  Layout — NOT async, renders instantly                              */
/* ------------------------------------------------------------------ */

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      {/* Header streams in independently */}
      <Suspense fallback={<HeaderSkeleton />}>
        <AppHeader />
      </Suspense>

      {/* Page content streams independently — loading.tsx handles the skeleton */}
      <main className="flex-1 pb-20 lg:pb-0">{children}</main>

      {/* Tab bar streams in independently */}
      <Suspense fallback={<TabBarSkeleton />}>
        <AppTabBar />
      </Suspense>
    </div>
  );
}
