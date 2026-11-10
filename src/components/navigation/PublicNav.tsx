import { Suspense } from "react";
import { AuthTrigger } from "@/components/auth/AuthTrigger";
import { CartNavButton } from "@/components/cart/CartNavButton";
import { CartAccessGate } from "@/components/cart/CartProvider";
import { profileIsAdmin } from "@/lib/auth/admin";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GlobalSearchLoader } from "@/components/search/GlobalSearchLoader";
import { FloatingNav } from "./FloatingNav";
import { UserMenu, type UserMenuProfile } from "./UserMenu";

/**
 * The ONE nav for every public page (landing, /courses, /tutors, profiles,
 * forgot-password, pay links, not-found). It used to be hand-written per page,
 * so the links, their order and the right-hand buttons changed as you moved
 * between pages — the bar visibly re-laid itself out on every click. Now the
 * links and actions are identical everywhere; only the active underline moves.
 *
 * Signed in → cart + the avatar menu (Dashboard lives inside it, never in the
 * bar). Signed out → Sign in + Get started + cart. The cart shows on every
 * public page, signed in or not — only checkout asks for an account.
 */
export const PUBLIC_NAV_LINKS = [
  { href: "/courses", label: "Courses" },
  { href: "/tutors", label: "Find a tutor" },
  { href: "/#learn", label: "Video Lessons" },
];

export function PublicNav({
  profile,
  search = true,
  showLinks = true,
}: {
  profile: UserMenuProfile | null;
  /** False where no search index should load (e.g. a not-found page). */
  search?: boolean;
  /** False on dashboard-side pages (e.g. a signed-in student's cart): the
   *  Courses / Find a tutor / Video Lessons links belong to the landing side,
   *  which the logo still links to. */
  showLinks?: boolean;
}) {
  return (
    <FloatingNav
      links={showLinks ? PUBLIC_NAV_LINKS : undefined}
      search={
        search ? (
          <Suspense fallback={<div className="h-9 w-9 sm:h-10 sm:w-10" />}>
            <GlobalSearchLoader />
          </Suspense>
        ) : undefined
      }
    >
      {profile ? (
        <>
          {/* Admins are staff: no cart, no booking (the server refuses too). */}
          <CartAccessGate disabled={profileIsAdmin(profile)} />
          <NotificationBell
            allHref={profile.role === "student" ? "/dashboard/notifications" : undefined}
          />
          {!profileIsAdmin(profile) && <CartNavButton />}
          <UserMenu profile={profile} />
        </>
      ) : (
        <>
          <CartAccessGate disabled={false} />
          <AuthTrigger
            tab="sign-in"
            className="inline-flex h-9 rounded-full px-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-100 sm:h-10 sm:px-3.5 sm:text-sm"
          >
            Sign in
          </AuthTrigger>
          <AuthTrigger
            tab="sign-up"
            className="h-9 rounded-full bg-slate-900 px-3 text-[13px] font-semibold text-white shadow-xs hover:bg-slate-800 sm:h-10 sm:px-4 sm:text-sm"
          >
            {/* Short label on phones so both actions fit in one row. */}
            <span className="sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Get started</span>
          </AuthTrigger>
          <CartNavButton />
        </>
      )}
    </FloatingNav>
  );
}
