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
 * Navigation is a sidebar from `lg` up and a scrollable tab row below it.
 *
 * Spacing is owned here: the content wrapper sits a fixed distance from the
 * nav, and every section inside uses `mt-10 first:mt-0`, so no tab can drift
 * by picking its own top margin.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("admin");

  return (
    // `overflow-clip`, not `overflow-hidden`: hidden makes this wrapper a
    // scroll container, which silently breaks the sidebar's `sticky`.
    <div className="relative overflow-clip">
      <BentoBackdrop tone="petrol" />
      <Container className="py-12">
        <PageHeader title="Admin console" />

        {/* Sidebar from lg up (sticky, so it stays in reach on long tabs);
            below lg the same nav is a scrollable row above the content. */}
        <div className="mt-8 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          <aside className="lg:sticky lg:top-24">
            <AdminTabs />
          </aside>
          <div className="mt-8 min-w-0 lg:mt-0">{children}</div>
        </div>
      </Container>
    </div>
  );
}
