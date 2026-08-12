import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSession, setSessionCookie } from "@/lib/auth/session";
import {
  exchangeGoogleCode,
  getGoogleOAuthClient,
  isGoogleConfigured,
} from "@/services/auth/google";

/**
 * GET /api/auth/google/callback — Google redirects here after consent.
 *
 * 1. Verifies the state cookie (CSRF) and consumes it (single-use).
 * 2. Exchanges the code for tokens and verifies the ID token.
 * 3. Upserts the Google identity into credentials via upsert_google_user
 *    (find-or-link-or-create; an existing email/password account gets the
 *    Google id linked to it — same profile, sessions and chats preserved).
 * 4. Issues the same session cookie as email sign-in, then sends the user
 *    to /onboarding if this was a brand-new account (one-time role pick) or
 *    straight to /dashboard if the email already had an account.
 *
 * Any failure bounces to /?auth=sign-in with a ?google_error= reason the
 * auth modal can surface.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const bounce = (reason: string) =>
    NextResponse.redirect(
      new URL(`/?auth=sign-in&google_error=${reason}`, request.url),
    );

  if (!isGoogleConfigured() || !code || !state) {
    return bounce("invalid_request");
  }

  // CSRF: the state must match the cookie we set before redirecting to Google.
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");
  if (!expectedState || expectedState !== state) {
    return bounce("state_mismatch");
  }

  let identity;
  try {
    identity = await exchangeGoogleCode(getGoogleOAuthClient(origin), code);
  } catch {
    return bounce("code_exchange_failed");
  }

  // Only accept verified Google emails (unverified ones can't own an account).
  if (!identity.emailVerified) {
    return bounce("email_not_verified");
  }

  const supabase = createAdminClient();
  const { data: profileId, error } = await supabase.rpc("upsert_google_user", {
    p_email: identity.email,
    p_google_id: identity.googleId,
    p_full_name: identity.fullName,
    p_avatar_url: identity.avatarUrl,
    p_role: "student", // placeholder — brand-new accounts pick their role on /onboarding
  });

  if (error || !profileId) {
    console.error("upsert_google_user failed", error?.message);
    return bounce("account_failed");
  }

  const token = await createSession(profileId as string);
  await setSessionCookie(token);

  // Brand-new Google accounts (onboarding_completed_at null — the RPC stamps
  // it when it LINKS an existing account) land on a one-time role pick;
  // returning accounts go straight to the dashboard.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", profileId)
    .maybeSingle();

  // On a DB hiccup, default to /dashboard — never wrongly route a returning
  // user to onboarding (a genuinely new user is caught by /onboarding's own
  // gate on their next Google sign-in).
  const destination =
    profileError || profile?.onboarding_completed_at
      ? "/dashboard"
      : "/onboarding";

  return NextResponse.redirect(new URL(destination, request.url));
}
