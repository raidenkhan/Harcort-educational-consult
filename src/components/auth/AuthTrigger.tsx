"use client";

import { useAuthModal } from "./AuthModal";
import { cn } from "@/lib/cn";

/**
 * A button that opens the auth modal at the given tab.
 * Style it with className — the auth modal replaces redirecting pages.
 *
 * `next` is an optional same-site path to return to after auth (a share link
 * opened signed-out). It is validated server-side by `safeNextPath`.
 */
export function AuthTrigger({
  tab,
  next,
  className,
  children,
  title,
}: {
  tab: "sign-in" | "sign-up";
  next?: string | null;
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const { open } = useAuthModal();
  return (
    <button
      type="button"
      title={title}
      onClick={() => open(tab, next)}
      className={cn(
        "inline-flex items-center justify-center transition duration-150 active:scale-[0.96]",
        className,
      )}
    >
      {children}
    </button>
  );
}
