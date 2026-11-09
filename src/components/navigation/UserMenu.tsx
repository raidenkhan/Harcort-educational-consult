"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { LayoutDashboard, LogOut, ShieldCheck } from "lucide-react";
import type { Profile } from "@/types";
import { profileIsAdmin } from "@/lib/auth/admin";
import { signOutAction } from "@/services/auth/actions";
import { TutorAvatar } from "@/components/ui/TutorAvatar";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { cn } from "@/lib/cn";

export type UserMenuProfile = Pick<
  Profile,
  "role" | "is_admin" | "full_name" | "avatar_url"
>;

/**
 * The signed-in user's avatar (photo or initials). Clicking it opens a small
 * menu with Dashboard, Admin (admins only) and Sign out — so "Dashboard" is
 * never a link in the nav bar itself. Shared by the public nav and the app
 * shell so the right-hand side looks the same everywhere.
 */
export function UserMenu({ profile }: { profile: UserMenuProfile }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const isAdmin = profileIsAdmin(profile);
  const dashboardHref = profile.role === "tutor" ? "/tutor" : "/dashboard";
  const name = profile.full_name || "Your account";

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Account menu for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full ring-2 ring-transparent transition duration-150 hover:ring-brand-200 active:scale-[0.96] sm:h-10 sm:w-10",
          open && "ring-brand-300",
        )}
      >
        <TutorAvatar name={name} src={profile.avatar_url} size={36} />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-60 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lift"
        >
          <div className="border-b border-slate-100 px-3 pb-2.5 pt-2">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-900">
              <span className="truncate">{name}</span>
              {isAdmin && <VerifiedBadge />}
            </p>
            <p className="text-xs capitalize text-slate-500">{profile.role}</p>
          </div>
          <div className="pt-1.5">
            <Link
              href={dashboardHref}
              role="menuitem"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Dashboard
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                role="menuitem"
                className={itemClass}
                onClick={() => setOpen(false)}
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Admin console
              </Link>
            )}
            <form action={signOutAction}>
              <button type="submit" role="menuitem" className={itemClass}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
