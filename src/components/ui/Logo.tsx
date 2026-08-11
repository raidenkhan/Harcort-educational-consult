import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Harcot home">
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-petrol-700 text-sm font-bold text-white shadow-xs">
        H
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display text-base font-bold tracking-tight",
            dark ? "text-white" : "text-slate-900",
          )}
        >
          Harcot
        </span>
        <span
          className={cn(
            "mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em]",
            dark ? "text-slate-400" : "text-slate-500",
          )}
        >
          Educational Consult
        </span>
      </span>
    </Link>
  );
}
