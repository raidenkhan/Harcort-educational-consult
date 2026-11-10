"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { cn } from "@/lib/cn";

/**
 * Header cart shortcut. The badge is the number of courses waiting, so the
 * student can see their shortlist from any page.
 */
export function CartNavButton({ className }: { className?: string }) {
  const { count, disabled } = useCart();
  const label = count === 0 ? "Cart" : `Cart, ${count} course${count === 1 ? "" : "s"}`;

  // Admins never book — no cart for them.
  if (disabled) return null;

  return (
    <Link
      href="/cart"
      aria-label={label}
      title={label}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition duration-150 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.96] sm:h-10 sm:w-10",
        className,
      )}
    >
      <ShoppingCart className="h-4 w-4" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
