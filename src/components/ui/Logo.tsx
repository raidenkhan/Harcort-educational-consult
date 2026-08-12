import Link from "next/link";
import { cn } from "@/lib/cn";
import { BrandMark } from "./BrandMark";

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5" aria-label="Harcourt home">
      <BrandMark size="md" />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display text-base font-bold tracking-tight",
            dark ? "text-white" : "text-slate-900",
          )}
        >
          Harcourt
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
