import { AdminSubTabs } from "@/components/admin/AdminSubTabs";

/**
 * Insights section — the read-only diagnostics: platform performance and the
 * SMS log. A route group, so the URLs stay `/admin/analytics` and
 * `/admin/sms` while both share one sub-tab row.
 */
const INSIGHT_TABS = [
  { href: "/admin/analytics", label: "Performance" },
  { href: "/admin/sms", label: "Texts" },
];

export default function AdminInsightsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminSubTabs items={INSIGHT_TABS} label="Insights sections" />
      {children}
    </>
  );
}
