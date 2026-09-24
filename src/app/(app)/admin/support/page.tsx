import { requireRole } from "@/services/auth/queries";
import { AdminResetCode } from "@/components/admin/AdminResetCode";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * Support tab — out-of-band help tools. Password reset codes today; the
 * reports-moderation UI (roadmap) slots in here as a second section.
 */
export default async function AdminSupportPage() {
  await requireRole("admin");

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
        Password resets
      </h2>
      <p className="mt-1 max-w-xl text-sm text-slate-600">
        Self-service reset lives at /forgot-password. These admin-issued codes
        are the fallback for accounts whose email doesn&apos;t work — the code
        is hashed at rest, single-use, and expires in 30 minutes.
      </p>
      <div className="mt-6">
        <AdminResetCode />
      </div>

      <div className="mt-14">
        <h2 className="font-display text-xl font-bold tracking-tight text-slate-900">
          Reports moderation
        </h2>
        <p className="mt-1 max-w-xl text-sm text-slate-600">
          Student and tutor reports land here for review.
        </p>
        <Card className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            The moderation UI isn&apos;t built yet — reports currently exist in
            the database only.
          </p>
          <Badge tone="neutral">Coming soon</Badge>
        </Card>
      </div>
    </section>
  );
}
