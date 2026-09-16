import Link from "next/link";
import { cn } from "@/lib/cn";
import { BrandMark } from "./BrandMark";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 sm:gap-2.5"
      aria-label="Harcourt home"
    >
      <BrandMark size="md" />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display text-[15px] font-bold tracking-tight sm:text-base",
            dark ? "text-white" : "text-slate-900",
          )}
        >
          Harcourt
        </span>
        {/* The subtitle makes the lockup ~60px wider, which is the difference
            between two nav actions fitting on a phone and not. It returns at
            sm, where there is room for it. */}
        <span
          className={cn(
            "mt-0.5 hidden text-[10px] font-medium uppercase tracking-[0.14em] sm:block",
            dark ? "text-slate-400" : "text-slate-500",
          )}
        >
          Educational Consult
        </span>
      </span>
    </Link>
  );
}
