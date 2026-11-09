import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  GraduationCap,
  UserCheck,
  UserX,
  Users,
  Wallet,
} from "lucide-react";
import { requireRole } from "@/services/auth/queries";
import {
  listApprovedTutorsForAdmin,
  listPendingTutors,
  listPlatformStats,
} from "@/services/admin/queries";
import { listAllEngagements, listAllPayouts } from "@/services/payments/queries";
import { deriveAdminPayments } from "@/components/payments/adminPayments";
import { StatGrid } from "@/components/admin/StatGrid";
import { formatGhs } from "@/lib/money";

/**
 * Overview tab — numbers only. Every headline figure in the console lives
 * here (people, money, student payments); the lists you act on live in their
 * own tabs, and each tile links to the tab where its number can be acted on.
 */
export default async function AdminOverviewPage() {
  await requireRole("admin");

  const [pending, approvedCount, platform, engagements, payouts] =
    await Promise.all([
      listPendingTutors(),
      listApprovedTutorsForAdmin(),
      listPlatformStats(),
      listAllEngagements(),
      listAllPayouts(),
    ]);
  const money = deriveAdminPayments({ engagements, payouts });

  return (
    <div>
      <StatGrid
        title="People & sessions"
        stats={[
          { label: "Pending applications", value: pending.length, icon: Users, tint: "bg-amber-50 text-amber-700", href: "/admin/people" },
          { label: "Approved tutors", value: approvedCount, icon: UserCheck, tint: "bg-emerald-50 text-emerald-700", href: "/admin/people" },
          { label: "Students tutored", value: platform.studentsTutored, icon: GraduationCap, tint: "bg-brand-50 text-brand-700" },
          { label: "Sessions scheduled", value: platform.sessionsScheduled, icon: CalendarClock, tint: "bg-petrol-50 text-petrol-700", href: "/admin/attendance" },
        ]}
      />

      <StatGrid
        title="Money"
        stats={[
          { label: "Collected", value: formatGhs(money.collected), icon: Wallet, tint: "bg-petrol-50 text-petrol-700", href: "/admin/payments/log" },
          { label: "Platform revenue", value: formatGhs(money.revenue), icon: Banknote, tint: "bg-brand-50 text-brand-700" },
          { label: "Outstanding", value: formatGhs(money.outstanding), icon: AlertTriangle, tint: "bg-amber-50 text-amber-700", href: "/admin/payments/agreements" },
          { label: "Payouts to review", value: money.needsReview, icon: Banknote, tint: "bg-red-50 text-red-700", href: "/admin/payments/payouts" },
        ]}
      />

      {/* Counted per STUDENT (summarizePlans), not per agreement: a student
          with two courses is one student, settled only when both are. No
          separate "Students" tile — it was just these three added up. */}
      <StatGrid
        title="Student payments"
        stats={[
          { label: "Paid in full", value: money.summary.paidInFull, icon: UserCheck, tint: "bg-emerald-50 text-emerald-700", href: "/admin/payments" },
          { label: "Paying in parts", value: money.summary.partPaid, icon: CalendarClock, tint: "bg-amber-50 text-amber-700" },
          { label: "Not yet paid", value: money.summary.unpaid, icon: UserX, tint: "bg-red-50 text-red-700", href: "/admin/payments/agreements" },
        ]}
      />
    </div>
  );
}
