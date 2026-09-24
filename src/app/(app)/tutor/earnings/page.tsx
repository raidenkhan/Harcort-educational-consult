import { requireRole } from "@/services/auth/queries";
import { TutorEarningsCard } from "@/components/payments/TutorEarningsCard";

/**
 * Earnings tab — the administrative side of tutoring: what's been collected,
 * what's outstanding, and payouts. Isolating it here keeps money surfaces one
 * deliberate click away from the teaching surfaces.
 */
export default async function TutorEarningsPage() {
  await requireRole("tutor");

  return (
    <section className="mt-10">
      <TutorEarningsCard />
    </section>
  );
}
