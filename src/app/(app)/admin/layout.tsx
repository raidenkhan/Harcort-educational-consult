import { requireRole } from "@/services/auth/queries";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Container } from "@/components/ui/Container";
import { AdminTabs } from "@/components/admin/AdminTabs";

/**
 * Admin console shell — shared header + section tabs. Each tab is its own
 * route (`/admin`, `/admin/attendance`, `/admin/payments`, `/admin/support`)
 * and fetches only what it shows, replacing the old single long dashboard.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("admin");

  return (
    <div className="relative overflow-hidden">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
          Harcourt Educational Consult
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
          Admin console
        </h1>

        <AdminTabs />

        {children}
      </Container>
    </div>
  );
}
