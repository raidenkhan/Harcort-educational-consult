import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** Dashboard skeleton — welcome heading + card grid + timetable section. */
export default function DashboardLoading() {
  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-64" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />

        {/* Payment ground rules skeleton (students only) */}
        <Skeleton className="mt-8 h-16 w-full rounded-lg" />

        {/* Card grid */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>

        {/* Timetable section */}
        <div className="mt-14">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-56" />
          <Skeleton className="mt-2 h-3 w-80 max-w-full" />

          <div className="mt-6 space-y-4">
            <SkeletonCard rows={2} />
            <SkeletonCard rows={2} />
          </div>
        </div>
      </Container>
    </div>
  );
}
