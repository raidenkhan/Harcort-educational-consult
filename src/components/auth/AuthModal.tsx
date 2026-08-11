"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SignInFields, SignUpFields } from "./AuthFields";
import { cn } from "@/lib/cn";

export type AuthTab = "sign-in" | "sign-up";

const AuthModalContext = createContext<{ open: (tab: AuthTab) => void }>({
  open: () => {},
});

export function useAuthModal() {
  return useContext(AuthModalContext);
}

// ---------------------------------------------------------------------------
// The ?auth= query param, read as an external store.
// The middleware bounces signed-out visitors to "/?auth=sign-in". Reading the
// param through useSyncExternalStore is hydration-safe: the server snapshot
// is null (no modal in the server HTML), and the modal opens on the
// post-hydration client render.
// ---------------------------------------------------------------------------
const authUrlListeners = new Set<() => void>();

function readAuthFromUrl(): AuthTab | null {
  if (typeof window === "undefined") return null;
  const auth = new URLSearchParams(window.location.search).get("auth");
  return auth === "sign-in" || auth === "sign-up" ? auth : null;
}

function subscribeToAuthUrl(callback: () => void) {
  authUrlListeners.add(callback);
  return () => {
    authUrlListeners.delete(callback);
  };
}

function getAuthUrlSnapshot(): AuthTab | null {
  return readAuthFromUrl();
}

function getAuthUrlServerSnapshot(): AuthTab | null {
  return null;
}

/** Drop the ?auth= param once the modal is closed, so refreshes stay clean. */
function clearAuthFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("auth")) return;
  params.delete("auth");
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + (qs ? `?${qs}` : ""),
  );
  authUrlListeners.forEach((listener) => listener());
}

/**
 * Auth modal — sign in / sign up pop in place with tabs instead of
 * redirecting. Escape or backdrop click closes; body scroll locks while open.
 * Entry: scale(0.96) + fade, 260ms ease-out (see --animate-modal-in).
 */
export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const urlTab = useSyncExternalStore(
    subscribeToAuthUrl,
    getAuthUrlSnapshot,
    getAuthUrlServerSnapshot,
  );
  const [tab, setTab] = useState<AuthTab | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const isOpen = tab !== null || urlTab !== null;
  const activeTab: AuthTab = tab ?? urlTab ?? "sign-in";

  const open = useCallback((next: AuthTab) => {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setTab(next);
  }, []);

  const close = useCallback(() => {
    setTab(null);
    clearAuthFromUrl();
  }, []);

  // Move focus into the dialog whenever it opens or the tab changes.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus();
  }, [isOpen, activeTab]);

  // Escape to close + scroll lock while open; restore focus on close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      triggerRef.current?.focus();
    };
  }, [isOpen, close]);

  if (!isOpen) {
    return (
      <AuthModalContext.Provider value={{ open }}>
        {children}
      </AuthModalContext.Provider>
    );
  }

  return (
    <AuthModalContext.Provider value={{ open }}>
      {children}

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Account"
      >
        {/* backdrop */}
        <div
          className="absolute inset-0 animate-fade-in bg-slate-950/50 backdrop-blur-sm"
          onClick={close}
          aria-hidden="true"
        />

        {/* panel */}
        <div
          ref={panelRef}
          tabIndex={-1}
          className="relative w-full max-w-md animate-modal-in overflow-hidden rounded-xl bg-white shadow-lift focus:outline-none"
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex rounded-lg bg-slate-100 p-1">
              {(
                [
                  { id: "sign-in", label: "Sign in" },
                  { id: "sign-up", label: "Sign up" },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-semibold transition duration-150 active:scale-[0.97]",
                    activeTab === t.id
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition duration-150 hover:bg-slate-100 hover:text-slate-700 active:scale-[0.95]"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="h-4 w-4"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* body */}
          <div className="px-6 py-6">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              {activeTab === "sign-in" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {activeTab === "sign-in"
                ? "Sign in to your Harcot account."
                : "Join Harcot as a student or a tutor."}
            </p>

            {activeTab === "sign-in" ? <SignInFields /> : <SignUpFields />}

            <p className="mt-6 text-center text-sm text-slate-500">
              {activeTab === "sign-in" ? (
                <>
                  New to Harcot?{" "}
                  <button
                    type="button"
                    onClick={() => setTab("sign-up")}
                    className="font-semibold text-brand-700 transition hover:text-brand-800"
                  >
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => setTab("sign-in")}
                    className="font-semibold text-brand-700 transition hover:text-brand-800"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </AuthModalContext.Provider>
  );
}
