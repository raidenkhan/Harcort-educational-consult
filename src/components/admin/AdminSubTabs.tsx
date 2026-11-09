"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/**
 * Second-level tabs inside an admin section (Payments, Insights). Real routes,
 * like the main tabs. Exactly ONE item is active: the longest href that
 * prefixes the pathname — so `/admin/payments` (Paid) doesn't also light
 * up while you are on `/admin/payments/log`.
 */
export function AdminSubTabs({
  items,
  label,
}: {
  items: { href: string; label: string }[];
  label: string;
}) {
  const pathname = usePathname();
  const activeHref = items
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label={label}
      // The baseline is an inset shadow, not a border: children paint over an
      // inset shadow, so the active underline covers it without the old
      // `-mb-px` trick — which overflowed the scroll box by 1px and showed a
      // stray vertical scrollbar.
      className="mb-8 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-slate-200)]"
    >
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150",
              active
                ? "border-brand-600 text-slate-900"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
