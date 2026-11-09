import { Suspense, cache } from "react";
import { getCurrentProfile, profileIsAdmin } from "@/services/auth/queries";
import { countUnreadGroupMessages } from "@/services/groups/queries";
import { MobileTabBar } from "@/components/navigation/MobileTabBar";
import { FloatingNav } from "@/components/navigation/FloatingNav";
import { CartNavButton } from "@/components/cart/CartNavButton";
import { UserMenu } from "@/components/navigation/UserMenu";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Cached profile lookup — deduplicates across the two Suspense boundaries
 * (header + tab bar) so we only hit Supabase once per request.
 */
const getProfile = cache(() => getCurrentProfile());

/**
 * Cached unread count — deduplicates across AppHeader + AppTabBar so the
 * memberships scan runs once per request, not twice.
 */
const getUnreadCount = cache(countUnreadGroupMessages);

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

  // 0036: a group message the student hasn't opened shows as a pill on the
  // Groups link, so "your tutor added you" is visible from any page.
  const groupUnread =
    profile && (profile.role === "student" || profile.role === "tutor")
      ? await getUnreadCount(profile)
      : 0;

  const links = [
    ...(profile?.role === "student" || profile?.role === "tutor"
      ? [
          { href: "/chat", label: "Messages" },
          { href: "/groups", label: "Groups", badge: groupUnread },
        ]
      : []),
  ];

  return (
    // Dashboard and Admin are NOT nav links: they live in the avatar menu (role-aware —
    // `/tutor` for tutors, `/dashboard` for everyone else), same as the
    // public nav, so the right-hand side is identical signed in or out.
    <FloatingNav links={links}>
      <CartNavButton />
      {profile && <UserMenu profile={profile} />}
    </FloatingNav>
  );
}

async function AppTabBar() {
  const profile = await getProfile();
  if (!profile) return null;
  const groupUnread =
    profile.role === "student" || profile.role === "tutor"
      ? await getUnreadCount(profile)
      : 0;
  return (
    <MobileTabBar
      role={profile.role}
      isAdmin={profileIsAdmin(profile)}
      groupUnread={groupUnread}
    />
  );
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
