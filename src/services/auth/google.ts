import { OAuth2Client } from "google-auth-library";

/**
 * Google OAuth — authorization code flow (server-side only).
 *
 * The route handlers under /api/auth/google run this flow: redirect the user
 * to Google's consent screen, exchange the returned code for tokens, verify
 * the ID token against our client id, and hand the verified claims to
 * upsert_google_user (find-or-link-or-create in `credentials`).
 *
 * The browser never sees an ID token and no NEXT_PUBLIC_* key is exposed:
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET stay server-only, like the
 * service-role Supabase key.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string | null;
}

export function isGoogleConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/**
 * Coerce an untrusted role value (query param, cookie payload) to the only
 * two self-selectable roles. Anything other than exactly "tutor" becomes
 * "student" — admin is impossible through this path.
 */
export function normalizeGoogleRole(
  raw: string | null | undefined,
): "student" | "tutor" {
  return raw === "tutor" ? "tutor" : "student";
}

/** OAuth2Client pinned to the given origin's callback URI. */
export function getGoogleOAuthClient(origin: string): OAuth2Client {
  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${origin}/api/auth/google/callback`,
  );
}

/** Consent URL. `state` is the CSRF token we set as a cookie before redirecting. */
export function buildGoogleAuthUrl(
  client: OAuth2Client,
  state: string,
): string {
  return client.generateAuthUrl({
    access_type: "online", // no refresh token needed — sign-in only
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    state,
  });
}

/**
 * Exchange the callback `code` for tokens, verify the ID token, and return
 * the claims we trust. Throws when the code is invalid/expired/already used
 * or when the token fails verification (audience mismatch, bad signature).
 */
export async function exchangeGoogleCode(
  client: OAuth2Client,
  code: string,
): Promise<GoogleIdentity> {
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new Error("Google did not return an ID token");
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google token missing subject or email");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    fullName: payload.name ?? "",
    avatarUrl: payload.picture ?? null,
  };
}
