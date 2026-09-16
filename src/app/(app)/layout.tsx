import { Suspense, cache } from "react";
import { getCurrentProfile, profileIsAdmin } from "@/services/auth/queries";
import { signOutAction } from "@/services/auth/actions";
import { Badge } from "@/components/ui/Badge";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { FloatingNav } from "@/components/navigation/FloatingNav";
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
  // Mirrors FloatingNav's geometry so streaming in the real header can't
  // shift the page.
  return (
    <div className="fixed inset-x-0 top-3 z-40 flex justify-center px-3 sm:px-6">
      <div className="flex h-14 w-full max-w-6xl items-center justify-between gap-2 rounded-full border border-slate-200/80 bg-white/85 pl-3 pr-1.5 shadow-sm backdrop-blur-xl sm:gap-3 sm:pl-3.5 sm:pr-2">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Skeleton className="h-9 w-9 rounded" />
          <Skeleton className="h-4 w-16 sm:h-5 sm:w-28" />
        </div>
        <div className="hidden items-center gap-6 md:flex">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
    </div>
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
    <FloatingNav links={links}>
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
          className="h-9 rounded-full border border-slate-300 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-xs transition duration-150 hover:border-slate-400 hover:bg-slate-50 sm:h-10 sm:px-3.5 sm:text-sm"
        >
          Sign out
        </button>
      </form>
    </FloatingNav>
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

      {/* Page content streams independently — loading.tsx handles the skeleton.
          pt-20 clears the floating nav, which no longer takes flow space. */}
      <main className="flex-1 pb-20 pt-20 lg:pb-0">{children}</main>

      {/* Tab bar streams in independently */}
      <Suspense fallback={<TabBarSkeleton />}>
        <AppTabBar />
      </Suspense>
    </div>
  );
}
