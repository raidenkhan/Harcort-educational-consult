"use client";

import { useSyncExternalStore } from "react";

/**
 * "Continue with Google" + divider, shared by the auth modal and the
 * standalone /sign-in and /sign-up pages (both render AuthFields, which
 * includes this block).
 *
 * The button is a plain link to /api/auth/google (server-side OAuth code
 * flow — the browser never sees an ID token or a client secret). Failures
 * come back as ?google_error=<reason>; this component maps them to readable
 * messages and clears the param so a refresh doesn't re-show them.
 *
 * The error is read through useSyncExternalStore (hydration-safe, like the
 * auth modal's ?auth= param) so no setState happens inside an effect —
 * keeps the React Compiler purity lint happy.
 */

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google sign-in isn't set up yet. Use email to sign in.",
  state_mismatch: "That sign-in link has expired. Please try again.",
  code_exchange_failed:
    "Google couldn't complete the sign-in. Please try again.",
  email_not_verified:
    "That Google account doesn't have a verified email. Try another account.",
  account_failed:
    "We couldn't create your account. Please try again or use email.",
  invalid_request: "That sign-in link was incomplete. Please try again.",
};

// ---------------------------------------------------------------------------
// ?google_error= read as an external store (same pattern as ?auth= in the
// auth modal): server snapshot is null, the client resolves the real value
// post-hydration, and we strip the param so refreshes stay clean.
// ---------------------------------------------------------------------------
const googleErrorListeners = new Set<() => void>();

function readGoogleErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("google_error");
}

function subscribeToGoogleError(callback: () => void) {
  googleErrorListeners.add(callback);
  return () => {
    googleErrorListeners.delete(callback);
  };
}

function getGoogleErrorSnapshot(): string | null {
  return readGoogleErrorFromUrl();
}

function getGoogleErrorServerSnapshot(): string | null {
  return null;
}

function clearGoogleError() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("google_error")) return;
  params.delete("google_error");
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + (qs ? `?${qs}` : ""),
  );
  googleErrorListeners.forEach((listener) => listener());
}

function GoogleG() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 40.1 44 36 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

export function GoogleAuthBlock({
  variant = "sign-in",
}: {
  variant?: "sign-in" | "sign-up";
}) {
  const googleError = useSyncExternalStore(
    subscribeToGoogleError,
    getGoogleErrorSnapshot,
    getGoogleErrorServerSnapshot,
  );

  const message = googleError
    ? (ERROR_MESSAGES[googleError] ?? "Google sign-in failed. Try again.")
    : null;

  return (
    <div className="mt-5">
      {message && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </div>
      )}

      <a
        href="/api/auth/google"
        onClick={clearGoogleError}
        className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-xs transition duration-150 hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98]"
      >
        <GoogleG />
        Continue with Google
      </a>

      {variant === "sign-up" && (
        <p className="mt-2 text-center text-xs leading-relaxed text-slate-400">
          Google accounts join as students. Joining as a tutor? Use email
          sign-up below.
        </p>
      )}

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium text-slate-400">
          or continue with email
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}
