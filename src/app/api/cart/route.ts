import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/services/auth/queries";
import { profileIsAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cart — the signed-in student's bookings that are still waiting
 * for payment, for the cart icon's badge. They live in the cart until paid
 * (/cart lists them), so the badge counts them alongside courses picked but
 * not yet booked. `serviceIds` lets the icon avoid counting a booked course
 * twice if it is also still in the browser's picked list. Scoped to the
 * session profile; everyone else gets zero.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const empty = NextResponse.json({ count: 0, serviceIds: [] }, { headers: { "Cache-Control": "no-store" } });
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "student" || profileIsAdmin(profile)) return empty;

  const { data, error } = await createAdminClient()
    .from("engagements")
    .select("tutor_service_id, agreed_total, paid_amount")
    .eq("student_id", profile.id)
    .eq("status", "pending_payment");
  if (error) return empty;

  const unpaid = (data ?? []).filter(
    (row) => Number(row.agreed_total) - Number(row.paid_amount ?? 0) > 0,
  );
  return NextResponse.json(
    { count: unpaid.length, serviceIds: unpaid.map((row) => row.tutor_service_id as string) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
