import { cn } from "@/lib/cn";

export function Card({
  className,
  children,
  padded = true,
  hover = false,
}: {
  className?: string;
  children: React.ReactNode;
  padded?: boolean;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-card",
        padded && "p-6",
        hover && "transition duration-200 hover:-translate-y-0.5 hover:shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}
