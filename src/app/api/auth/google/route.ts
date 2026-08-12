import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
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
 * code, so an attacker can't replay a callback URL.
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

  const authUrl = buildGoogleAuthUrl(getGoogleOAuthClient(origin), state);
  return NextResponse.redirect(authUrl);
}
