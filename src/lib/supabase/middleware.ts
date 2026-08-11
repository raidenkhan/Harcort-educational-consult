import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Route guards for the self-hosted session cookie:
 * - protected routes (/dashboard, /admin, /tutor, /chat) require the cookie
 * - signed-in users are kept off /sign-in and /sign-up
 *
 * This is a cheap first line of defense (cookie presence only — no database
 * call per request). Page-level checks in services/auth/queries remain the
 * authoritative guard.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  const isAuthRoute =
    pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/tutor") ||
    pathname.startsWith("/chat");

  // Not signed in → keep off protected routes. Send them to the landing page
  // with ?auth=sign-in so the auth modal opens automatically.
  if (!hasSession && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("auth", "sign-in");
    return NextResponse.redirect(url);
  }

  // Signed in → keep them off the auth pages.
  if (hasSession && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
