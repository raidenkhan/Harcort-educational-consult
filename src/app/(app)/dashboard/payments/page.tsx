import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";
import { PaymentGroundRules } from "@/components/support/PaymentGroundRules";
import { StudentPaymentsCard } from "@/components/payments/StudentPaymentsCard";

/**
 * Student dashboard — Payments. The money view: every agreement, what has
 * been paid, what is left and the pay button for the outstanding balance.
 * The compact ground-rules banner sits on top (the full card stays on Home,
 * next to the paywall) because this is the page a student pays from.
 */
export default async function StudentPaymentsPage() {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/dashboard");

  return (
    <div className="mt-10">
      <PaymentGroundRules variant="banner" className="mb-6" />
      <StudentPaymentsCard />
    </div>
  );
}
