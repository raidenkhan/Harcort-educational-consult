import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/**
 * Dashboard skeleton — the content under the tab row. The shell (backdrop,
 * container, heading and tabs) comes from layout.tsx, so this only sketches
 * whatever section the route is loading.
 */
export default function DashboardLoading() {
  return (
    <div className="mt-10 space-y-6">
      <SkeletonCard rows={2} />
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
