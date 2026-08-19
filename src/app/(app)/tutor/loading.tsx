import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** Tutor page skeleton — profile form, services, timetable. */
export default function TutorLoading() {
  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="purple" />
      <Container className="py-12">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-8 w-52" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />

        {/* Status badge */}
        <Skeleton className="mt-4 h-5 w-40 rounded-full" />

        {/* 2-col form area */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <SkeletonCard rows={4} />
          <div className="space-y-6">
            <SkeletonCard rows={3} />
            <SkeletonCard rows={2} />
          </div>
        </div>

        {/* Timetable section */}
        <div className="mt-16">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-56" />
          <Skeleton className="mt-2 h-3 w-80 max-w-full" />

          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <SkeletonCard rows={2} />
              <SkeletonCard rows={2} />
            </div>
            <SkeletonCard rows={3} />
          </div>
        </div>
      </Container>
    </div>
  );
}
