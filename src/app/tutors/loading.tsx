import { TutorExplorerSkeleton } from "@/components/tutors/TutorExplorerSkeleton";

/**
 * Public /tutors route skeleton. The directory is server-rendered from a
 * cached query; this paints instantly while the tutor list streams in, so
 * the first impression is structure instead of a blank scroll.
 */
export default function Loading() {
  return <TutorExplorerSkeleton />;
}
