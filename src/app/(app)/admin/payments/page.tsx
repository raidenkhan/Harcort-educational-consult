import { requireRole } from "@/services/auth/queries";
import { AdminPaymentsConsole } from "@/components/payments/AdminPaymentsConsole";

/**
 * Payments tab — the money console: platform stats, payout queue with
 * approve/send/hold, and agreements oversight. Isolated from the tutor
 * review and attendance surfaces.
 */
export default async function AdminPaymentsPage() {
  await requireRole("admin");

  return <AdminPaymentsConsole />;
}
