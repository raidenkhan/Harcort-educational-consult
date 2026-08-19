import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** Admin page skeleton — stat row + application list + attendance table. */
export default function AdminLoading() {
  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-8 w-52" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />

        {/* Stat cards row */}
        <div className="mt-8 grid gap-4 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-card"
            >
              <Skeleton className="h-11 w-11 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-6 w-12" />
                <Skeleton className="mt-1.5 h-3 w-20" />
              </div>
            </div>
          ))}
        </div>

        {/* Application list skeleton */}
        <div className="mt-14">
          <Skeleton className="h-5 w-40" />
          <div className="mt-6 space-y-4">
            <SkeletonCard rows={3} />
            <SkeletonCard rows={3} />
          </div>
        </div>

        {/* Attendance table skeleton */}
        <div className="mt-14">
          <Skeleton className="h-5 w-40" />
          <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex gap-4 px-5 py-3.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, r) => (
              <div
                key={r}
                className="flex gap-4 border-t border-slate-100 px-5 py-3.5"
              >
                {Array.from({ length: 5 }).map((_, c) => (
                  <Skeleton key={c} className="h-3 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
