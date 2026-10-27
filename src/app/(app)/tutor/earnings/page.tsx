import { requireRole } from "@/services/auth/queries";
import { TutorEarningsCard } from "@/components/payments/TutorEarningsCard";
import { TutorPaymentsCard } from "@/components/payments/TutorPaymentsCard";

/**
 * Earnings tab — the administrative side of tutoring: what's been collected,
 * what's outstanding, and payouts. The payments table lives here in full too,
 * so the dashboard can show just the newest few without hiding history.
 */
export default async function TutorEarningsPage() {
  await requireRole("tutor");

  return (
    <section className="mt-10 space-y-8">
      <TutorEarningsCard />
      <TutorPaymentsCard linkToEarnings={false} />
    </section>
  );
}
