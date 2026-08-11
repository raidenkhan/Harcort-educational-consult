"use client";

import { useAuthModal } from "./AuthModal";
import { cn } from "@/lib/cn";

/**
 * A button that opens the auth modal at the given tab.
 * Style it with className — the auth modal replaces redirecting pages.
 */
export function AuthTrigger({
  tab,
  className,
  children,
  title,
}: {
  tab: "sign-in" | "sign-up";
  className?: string;
  children: React.ReactNode;
  title?: string;
}) {
  const { open } = useAuthModal();
  return (
    <button
      type="button"
      title={title}
      onClick={() => open(tab)}
      className={cn(
        "inline-flex items-center justify-center transition duration-150 active:scale-[0.97]",
        className,
      )}
    >
      {children}
    </button>
  );
}
