import { AdminSubTabs } from "@/components/admin/AdminSubTabs";

/**
 * Payments section — sub-tabs instead of one long page. Each sub-tab is its
 * own route and fetches only what it shows; the money totals live on the
 * console Overview.
 */
const PAYMENT_TABS = [
  { href: "/admin/payments", label: "Paid" },
  { href: "/admin/payments/payouts", label: "Payouts" },
  { href: "/admin/payments/plans", label: "Plan requests" },
  { href: "/admin/payments/agreements", label: "Agreements" },
  { href: "/admin/payments/links", label: "Payment links" },
  { href: "/admin/payments/log", label: "Payment log" },
];

export default function AdminPaymentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminSubTabs items={PAYMENT_TABS} label="Payments sections" />
      {children}
    </>
  );
}
