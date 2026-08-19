import { cn } from "@/lib/cn";

/** Animated skeleton bar — the ghost primitive for loading states. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

/** A full skeleton card matching the Card component styling. */
export function SkeletonCard({
  className,
  rows = 2,
}: {
  className?: string;
  rows?: number;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-6 shadow-card",
        className,
      )}
    >
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("mt-3 h-3.5", i === rows - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
