import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildGoogleAuthUrl,
  getGoogleOAuthClient,
  isGoogleConfigured,
  normalizeGoogleRole,
} from "@/services/auth/google";

/**
 * GET /api/auth/google — start "Sign in with Google".
 *
 * Sets a short-lived httpOnly state cookie (CSRF protection) that also
 * carries the sign-up role choice (optional ?role=tutor), then redirects
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

  const url = new URL(request.url);
  const origin = url.origin;
  const state = randomBytes(16).toString("hex");
  // Optional ?role=tutor lets Google sign-ups pick their role before the
  // redirect. It rides inside the CSRF cookie (not the state Google echoes)
  // so the choice can't be forged or swapped mid-flow.
  const role = normalizeGoogleRole(url.searchParams.get("role"));

  const cookieStore = await cookies();
  cookieStore.set("google_oauth_state", JSON.stringify({ state, role }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes to complete the flow
  });

  const authUrl = buildGoogleAuthUrl(getGoogleOAuthClient(origin), state);
  return NextResponse.redirect(authUrl);
}
