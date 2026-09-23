import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainPaymentOutbox } from "@/lib/email/outbox";

/**
 * GET /api/payments/sweep — cron entry point for payment deadlines.
 *
 * Flips past-due installments to overdue (was_overdue history), writes ledger
 * events, enqueues notifications, then drains the outbox. Idempotent: the RPC
 * only flips rows that are pending AND past due, so double-fires are no-ops.
 *
 * Auth: CRON_SECRET header check (Authorization: Bearer <secret>). Vercel Cron
 * sends exactly that. Configure in vercel.json: { "crons": [{ "path":
 * "/api/payments/sweep", "schedule": "*\/15 * * * *" }] } — every 15 minutes
 * is plenty; the sweep itself is idempotent.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: flipped, error } = await supabase.rpc("payment_sweep_overdue");
  if (error) {
    console.error("[payments] overdue sweep failed", error);
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }

  // Same run drains any queued notifications (overdue emails included).
  await drainPaymentOutbox();

  return NextResponse.json({ ok: true, flipped });
}
