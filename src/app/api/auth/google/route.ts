import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/redirect";
import {
  buildGoogleAuthUrl,
  getGoogleOAuthClient,
  isGoogleConfigured,
} from "@/services/auth/google";

/**
 * GET /api/auth/google — start "Sign in with Google".
 *
 * Sets a short-lived httpOnly state cookie (CSRF protection), then redirects
 * the user to Google's consent screen. The callback at
 * /api/auth/google/callback verifies the state cookie before exchanging the
 * code, so an attacker can't replay a callback URL. Brand-new Google emails
 * get a one-time role pick on /onboarding after sign-in; accounts that
 * already exist go straight to /dashboard.
 */
export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.redirect(
      new URL("/?auth=sign-in&google_error=not_configured", request.url),
    );
  }

  const origin = new URL(request.url).origin;
  const state = randomBytes(16).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes to complete the flow
  });

  // Where to land after the round-trip. A share link opened signed-out sends
  // `/tutors/HC-T-…?course=…&request=1` here; without this cookie the student
  // would finish Google sign-in on /dashboard and lose the course. The cookie
  // is httpOnly and validated again on the way out (safeNextPath), so it is
  // never a trusted redirect target — only a carrier.
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (next) {
    cookieStore.set("google_oauth_next", next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  }

  const authUrl = buildGoogleAuthUrl(getGoogleOAuthClient(origin), state);
  return NextResponse.redirect(authUrl);
}
