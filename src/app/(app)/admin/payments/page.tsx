import { AdminPaidTab } from "@/components/payments/AdminPaymentsConsole";

/**
 * Payments → Paid, the section's first tab: every student who has paid, with
 * their courses. It sits at the section root so the sidebar's Payments link
 * lands on it.
 */
export default function AdminPaidPage() {
  return <AdminPaidTab />;
}
