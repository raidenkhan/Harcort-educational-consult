import { requireRole } from "@/services/auth/queries";
import { BentoBackdrop } from "@/components/ui/BentoBackdrop";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { AdminTabs } from "@/components/admin/AdminTabs";

/**
 * Admin console shell — shared header + section tabs. Each tab is its own
 * route and fetches only what it shows (see AdminTabs for the map). This is
 * an admin's ONE dashboard: `/dashboard` sends role-`admin` accounts here.
 *
 * Spacing is owned here: the content wrapper sits a fixed distance below the
 * tabs, and every section inside uses `mt-10 first:mt-0`, so no tab can drift
 * by picking its own top margin.
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

        <div className="mt-8">{children}</div>
      </Container>
    </div>
  );
}
