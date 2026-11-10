"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/components/cart/CartProvider";
import { cn } from "@/lib/cn";

/**
 * Header cart shortcut. The badge counts everything in the cart: courses
 * picked but not booked yet (this browser) PLUS bookings made but not paid
 * (from /api/cart — they live in the cart until paid). A picked course that
 * is already booked is counted once. Refreshed on every page change and when
 * the tab regains focus.
 */
export function CartNavButton({ className }: { className?: string }) {
  const { lines, disabled } = useCart();
  const pathname = usePathname();
  const [pending, setPending] = useState<{ count: number; serviceIds: string[] }>({ count: 0, serviceIds: [] });

  useEffect(() => {
    if (disabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/cart", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number; serviceIds: string[] };
        if (!cancelled) setPending({ count: data.count ?? 0, serviceIds: data.serviceIds ?? [] });
      } catch {
        // Offline — keep the last count.
      }
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname, disabled]);

  const booked = new Set(pending.serviceIds);
  const count = lines.filter((line) => !booked.has(line.tutorServiceId)).length + pending.count;
  const label = count === 0 ? "Cart" : `Cart, ${count} item${count === 1 ? "" : "s"}`;

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
