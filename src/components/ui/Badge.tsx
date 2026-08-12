import { cn } from "@/lib/cn";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "petrol"
  | "green"
  | "amber"
  | "red"
  | "glass";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-800",
  petrol: "bg-petrol-50 text-petrol-800",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  glass: "bg-white/10 text-white ring-1 ring-inset ring-white/15",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
