import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { drainPaymentOutbox } from "@/lib/email/outbox";
import { requeryAndFinalizeTransfers } from "@/services/payments/transfers";
import { reconcileStaleCharges } from "@/services/payments/reconcile";
import { notifySmsToProfiles } from "@/lib/sms";
import {
  installmentReminderDedupePrefix,
  installmentsToRemind,
  type InstallmentReminder,
} from "@/lib/smsReminders";
import { formatGhs } from "@/lib/money";

/**
 * GET /api/payments/sweep — cron entry point for payment deadlines.
 *
 * Three jobs, in this order:
 *   1. Reconcile charges whose webhook never arrived (belt and braces for a
 *      misconfigured Paystack webhook — the return path covers the student
 *      who comes straight back; this covers the one who closes the tab).
 *   2. Flip past-due installments to overdue (was_overdue history).
 *   3. Requery in-flight payouts and drain queued notifications.
 *
 * Idempotent: reconciliation short-circuits already-paid rows, the overdue
 * RPC only flips pending rows that are past due, and the outbox marks each
 * row sent once.
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

  // 1) Self-heal charges Paystack says are paid but our rows still call
  // 'initialized'. Bounded (5 per run) so the cron stays fast.
  let reconciled: { checked: number; applied: number } | null = null;
  try {
    reconciled = await reconcileStaleCharges(10, 5);
  } catch (err) {
    console.error("[payments] stale charge reconciliation failed", err);
  }

  const { data: flipped, error } = await supabase.rpc("payment_sweep_overdue");
  if (error) {
    console.error("[payments] overdue sweep failed", error);
    return NextResponse.json({ error: "sweep failed" }, { status: 500 });
  }

  // 2) Self-heal missed transfer webhooks: requery Paystack for payouts stuck
  // 'transferring' and finalize paid/failed. Best-effort — a requery failure
  // is logged inside the helper and retried on the next run.
  let transfers: { checked: number; finalized: number } | null = null;
  try {
    transfers = await requeryAndFinalizeTransfers(2);
  } catch (err) {
    console.error("[payments] transfer requery failed", err);
  }

  // 3) Same run drains any queued notifications (payment + overdue emails).
  await drainPaymentOutbox();

  // …and texts the students whose money is due today or already overdue.
  const texted = await textInstallmentReminders(supabase, Date.now());

  return NextResponse.json({
    ok: true,
    reconciled,
    flipped,
    transfers,
    texted,
  });
}

/**
 * Text students about installments that fall due today or have gone overdue.
 *
 * Each text claims a dedupe key first ("installment:<id>:due:<profile>"), so
 * the daily sweep can run as often as it likes without texting anybody twice.
 */
async function textInstallmentReminders(
  supabase: ReturnType<typeof createAdminClient>,
  now: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("installments")
    .select(
      "id, idx, amount, due_at, status, engagements!installments_engagement_id_fkey(student_id)",
    )
    .in("status", ["pending", "overdue"]);

  if (error) {
    console.error(`[sms] installment reminder query failed: ${error.message}`);
    return 0;
  }

  const installments: InstallmentReminder[] = (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      idx: number;
      amount: string | number;
      due_at: string;
      status: string;
      engagements?:
        | { student_id: string }
        | { student_id: string }[]
        | null;
    };
    const engagement = Array.isArray(r.engagements)
      ? r.engagements[0]
      : r.engagements;
    return {
      id: r.id,
      idx: r.idx,
      amount: BigInt(r.amount ?? 0),
      dueAt: r.due_at,
      status: r.status,
      studentId: engagement?.student_id ?? "",
    };
  });

  let sent = 0;
  for (const { kind, installment } of installmentsToRemind(installments, now)) {
    if (!installment.studentId) continue;
    const amount = formatGhs(installment.amount);
    notifySmsToProfiles(
      [installment.studentId],
      kind === "due"
        ? `Harcourt: installment ${installment.idx} of ${amount} is due today. Open the app to pay.`
        : `Harcourt: installment ${installment.idx} of ${amount} is overdue. Open the app to pay.`,
      "payment_reminder",
      installmentReminderDedupePrefix(installment.id, kind),
    );
    sent += 1;
  }

  return sent;
}
