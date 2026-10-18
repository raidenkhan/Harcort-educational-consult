import { requireRole } from "@/services/auth/queries";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
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
        <PageHeader title="Admin console" />

        <AdminTabs />

        {children}
      </Container>
    </div>
  );
}
