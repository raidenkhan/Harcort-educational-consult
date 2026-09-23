import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGhs } from "@/lib/money";
import { deliver } from "./notify";
import { adminEmails, emailsForProfiles } from "./recipients";
import {
  paymentEngagementActivatedEmail,
  paymentEngagementCreatedEmail,
  paymentOverdueEmail,
  paymentReceivedEmail,
  payoutStatusEmail,
  type EmailMessage,
} from "./templates";

/**
 * notification_outbox drain — the notifications half of migration 0011.
 *
 * Every money state-change enqueues outbox rows in the SAME transaction, so
 * "paid but nobody told anyone" is impossible. This module drains those rows
 * (best-effort, after the response) and marks them sent. A failed send bumps
 * `attempts` and stays queued — a later sweep or request retries it.
 */

interface OutboxRow {
  id: string;
  type: string;
  audience: "student" | "tutor" | "admin";
  recipient_id: string | null;
  engagement_id: string | null;
  data: Record<string, unknown>;
}

/** Build the email for one outbox row. Returns null for unknown types. */
function buildEmail(row: OutboxRow): EmailMessage | null {
  const idx = Number(row.data.installment_idx ?? 1);
  const amount = typeof row.data.amount === "string" || typeof row.data.amount === "number"
    ? formatGhs(BigInt(row.data.amount))
    : "";

  switch (row.type) {
    case "payment.received":
      if (!row.recipient_id) return null;
      return paymentReceivedEmail({
        audience: row.audience,
        installmentIdx: idx,
        amountDisplay: amount,
      });
    case "payment.engagement_created":
      return paymentEngagementCreatedEmail({ audience: row.audience as "tutor" | "admin" });
    case "payment.engagement_activated":
      return paymentEngagementActivatedEmail({ audience: row.audience as "tutor" | "admin" });
    case "payment.overdue":
      return paymentOverdueEmail({
        audience: row.audience,
        installmentIdx: idx,
        amountDisplay: amount,
      });
    case "payment.payout_requested":
      return payoutStatusEmail({ status: "requested", amountDisplay: amount });
    case "payment.payout_approved":
      return payoutStatusEmail({ status: "approved", amountDisplay: amount });
    case "payment.payout_paid":
      return payoutStatusEmail({ status: "paid", amountDisplay: amount });
    case "payment.payout_held":
      return payoutStatusEmail({
        status: "held",
        amountDisplay: amount,
        reason: typeof row.data.reason === "string" ? row.data.reason : null,
      });
    default:
      return null;
  }
}

/** Resolve one row's recipient (or every admin for audience='admin'). */
async function recipientsFor(row: OutboxRow): Promise<string[]> {
  if (row.audience === "admin") return adminEmails();
  if (!row.recipient_id) return [];
  const emails = await emailsForProfiles([row.recipient_id]);
  const email = emails.get(row.recipient_id);
  return email ? [email] : [];
}

/**
 * Drain pending outbox rows and email them. Safe to call after any response;
 * each row is only marked sent once its email is dispatched (or permanently
 * unbuildable). Attempts are capped — poison rows stop at 5.
 */
export async function drainPaymentOutbox(): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("notification_outbox")
    .select("id, type, audience, recipient_id, engagement_id, data, attempts")
    .is("sent_at", null)
    .lt("attempts", 5)
    .order("created_at", { ascending: true })
    .limit(25);

  if (error) {
    console.error("[outbox] fetch failed", error);
    return;
  }
  const rows = (data ?? []) as unknown as OutboxRow[];
  if (rows.length === 0) return;

  for (const row of rows) {
    try {
      const email = buildEmail(row);
      const recipients = email ? await recipientsFor(row) : [];

      if (!email || recipients.length === 0) {
        // Unbuildable or no reachable recipient — mark sent to stop retries
        // (audience='admin' with zero admins configured is the common case).
        if (!email) {
          console.warn(`[outbox] dropped unbuildable ${row.type} row ${row.id}`);
        }
        await supabase
          .from("notification_outbox")
          .update({ sent_at: new Date().toISOString() })
          .eq("id", row.id)
          .is("sent_at", null);
        continue;
      }

      await Promise.all(recipients.map((to) => deliver(to, email)));

      // Mark sent whether deliver reported an error or not: deliver already
      // logged failures, and Resend-level losses are accepted (best-effort
      // channel). Two concurrent drains can rarely double-send an email —
      // accepted: duplicate mail is far less harmful than lost mail.
      await supabase
        .from("notification_outbox")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("sent_at", null);
    } catch (err) {
      // Unexpected row-level failure — count the attempt and move on; the
      // lt(attempts, 5) fetch guard stops poison rows from looping forever.
      console.error(`[outbox] row ${row.id} (${row.type}) failed`, err);
      const current = (row as unknown as { attempts: number }).attempts ?? 0;
      await supabase
        .from("notification_outbox")
        .update({ attempts: current + 1 })
        .eq("id", row.id);
    }
  }
}

/** Fire-and-forget drain scheduled after the response flushes. */
export function scheduleOutboxDrain(): void {
  const run = () => {
    void drainPaymentOutbox().catch((err) => {
      console.error("[outbox] drain failed", err);
    });
  };
  try {
    after(run);
  } catch {
    run();
  }
}
