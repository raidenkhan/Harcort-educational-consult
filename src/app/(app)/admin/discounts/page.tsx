import { requireRole } from "@/services/auth/queries";
import { listDiscountCodesForAdmin, listStudentsForDiscounts } from "@/services/discounts/store";
import { DiscountCodesManager } from "@/components/admin/DiscountCodesManager";
import { AdminSection } from "@/components/admin/AdminSection";
import { accraDate } from "@/lib/time";

/**
 * Admin → Discount codes (0044): personal, single-use percentage discounts.
 * The student enters the code in the booking dialog or the cart; Harcourt
 * absorbs the discount, so the tutor's share is unchanged.
 */
export default async function AdminDiscountsPage() {
  await requireRole("admin");
  const [codes, students] = await Promise.all([listDiscountCodesForAdmin(), listStudentsForDiscounts()]);

  if (codes === null) {
    return (
      <AdminSection title="Discount codes">
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
          Discount codes aren&apos;t set up yet. Apply migration
          <code className="mx-1 font-mono">0044_discount_codes.sql</code>
          in the Supabase SQL Editor, then reload this page.
        </div>
      </AdminSection>
    );
  }

  const dateLabels = Object.fromEntries(
    codes.map((c) => [
      c.id,
      {
        created: accraDate(new Date(c.createdAt)),
        expires: c.expiresAt ? accraDate(new Date(c.expiresAt)) : null,
        used: c.usedAt ? accraDate(new Date(c.usedAt)) : null,
      },
    ]),
  );

  return (
    <AdminSection
      title="Discount codes"
      description="Give one student a percentage off their next booking. Each code works once, only for that student. Harcourt covers the discount — tutors are paid their normal share."
    >
      <DiscountCodesManager codes={codes} students={students} dateLabels={dateLabels} />
    </AdminSection>
  );
}
