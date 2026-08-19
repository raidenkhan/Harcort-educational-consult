import { Container } from "@/components/ui/Container";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

/** Generic loading skeleton shown while any (app) page streams in. */
export default function AppLoading() {
  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        {/* Page label */}
        <Skeleton className="h-3 w-24" />
        {/* Heading */}
        <Skeleton className="mt-3 h-8 w-56" />
        {/* Subheading */}
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />

        {/* Card grid — matches the 2-col grid used by most pages */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </Container>
    </div>
  );
}
