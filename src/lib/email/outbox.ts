import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatGhs } from "@/lib/money";
import { deliver } from "./notify";
import { adminEmails, emailsForProfiles } from "./recipients";
import {
  groupJoinedEmail,
  paymentEngagementActivatedEmail,
  paymentEngagementCreatedEmail,
  paymentOverdueEmail,
  paymentReceivedEmail,
  payoutStatusEmail,
  tutorRequestEmail,
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

/** Outbox types whose payload is a `request_id` rather than an engagement. */
const REQUEST_TYPES = new Set([
  "request.received",
  "request.accepted",
  "request.declined",
]);

/** Who just joined a tutor's group, and which group (0038's group seat). */
interface GroupJoinedContext {
  studentName: string;
  groupName: string;
  courseName: string;
}

/** The people/course a payment row is about. Resolved from the engagement so
 *  the email names them even when the outbox payload (written by the DB RPC)
 *  only carries an amount. */
interface PaymentContext {
  studentName: string;
  courseTitle: string;
  tutorName: string;
  /** The agreement is active/completed — the booking is confirmed. */
  confirmed: boolean;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function paymentContext(
  engagementId: string | null,
  cache: Map<string, PaymentContext | null>,
): Promise<PaymentContext | null> {
  if (!engagementId) return null;
  if (cache.has(engagementId)) return cache.get(engagementId) ?? null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("engagements")
    .select(
      `status, courses(name), profiles!engagements_student_id_fkey(full_name), tutor_profiles(profiles(full_name))`,
    )
    .eq("id", engagementId)
    .maybeSingle();

  if (error || !data) {
    // Best-effort: the email still goes out with generic copy.
    cache.set(engagementId, null);
    return null;
  }

  const row = data as unknown as {
    status?: string;
    courses?: { name?: string } | { name?: string }[] | null;
    profiles?: { full_name?: string } | { full_name?: string }[] | null;
    tutor_profiles?:
      | {
          profiles?:
            | { full_name?: string }
            | { full_name?: string }[]
            | null;
        }
      | {
          profiles?:
            | { full_name?: string }
            | { full_name?: string }[]
            | null;
        }[]
      | null;
  };

  const context: PaymentContext = {
    studentName: one(row.profiles)?.full_name ?? "",
    courseTitle: one(row.courses)?.name ?? "",
    tutorName: one(one(row.tutor_profiles)?.profiles)?.full_name ?? "",
    confirmed: row.status === "active" || row.status === "completed",
  };
  cache.set(engagementId, context);
  return context;
}

/** The people/course a tutor-request row is about. The RPCs queue only a
 *  `request_id`, so the names have to be resolved here. */
interface RequestContext {
  studentName: string;
  tutorName: string;
  courseTitle: string;
}

async function requestContext(
  requestId: string,
  cache: Map<string, RequestContext | null>,
): Promise<RequestContext | null> {
  if (!requestId) return null;
  if (cache.has(requestId)) return cache.get(requestId) ?? null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tutor_requests")
    .select(
      `courses(name), profiles!tutor_requests_student_id_fkey(full_name), tutor_profiles(profiles(full_name))`,
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error || !data) {
    // Best-effort: the email still goes out with generic copy.
    cache.set(requestId, null);
    return null;
  }

  const row = data as unknown as {
    courses?: { name?: string } | { name?: string }[] | null;
    profiles?: { full_name?: string } | { full_name?: string }[] | null;
    tutor_profiles?:
      | { profiles?: { full_name?: string } | { full_name?: string }[] | null }
      | {
          profiles?: { full_name?: string } | { full_name?: string }[] | null;
        }[]
      | null;
  };

  const context: RequestContext = {
    studentName: one(row.profiles)?.full_name ?? "",
    tutorName: one(one(row.tutor_profiles)?.profiles)?.full_name ?? "",
    courseTitle: one(row.courses)?.name ?? "",
  };
  cache.set(requestId, context);
  return context;
}

/** Resolve the names behind a `payment.group_joined` row (0038). */
async function groupJoinedContext(
  groupId: string,
  studentId: string,
): Promise<GroupJoinedContext | null> {
  const supabase = createAdminClient();
  const [group, student] = await Promise.all([
    supabase
      .from("study_groups")
      .select("name, courses(name)")
      .eq("id", groupId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", studentId)
      .maybeSingle(),
  ]);
  if (group.error || !group.data) return null;

  const g = group.data as unknown as {
    name?: string;
    courses?: { name?: string } | { name?: string }[] | null;
  };
  return {
    groupName: g.name ?? "",
    courseName: one(g.courses)?.name ?? "",
    studentName:
      ((student.data as { full_name?: string } | null)?.full_name ?? "") ||
      "A student",
  };
}

/** Parse a pesewas value out of an outbox payload. Bad input is simply absent. */
function pesewas(value: unknown): bigint | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.round(value));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

/** Build the email for one outbox row. Returns null for unknown types. */
function buildEmail(
  row: OutboxRow,
  context: PaymentContext | null,
  request: RequestContext | null,
  group: GroupJoinedContext | null,
): EmailMessage | null {
  const idx = Number(row.data.installment_idx ?? 1);
  const amount = typeof row.data.amount === "string" || typeof row.data.amount === "number"
    ? formatGhs(BigInt(row.data.amount))
    : "";

  switch (row.type) {
    case "payment.received": {
      // Admin rows fan out to every admin and legitimately carry no
      // recipient_id (recipientsFor resolves the list). Guarding on it here
      // silently discarded every admin "a payment landed" notification.
      if (row.audience !== "admin" && !row.recipient_id) return null;

      // The student's copy is a receipt, so it itemises the fee and the total
      // and carries the reference. Older queued rows predate 0038 and carry
      // neither — those still send, just without the extra lines.
      const net = pesewas(row.data.amount);
      const fee = pesewas(row.data.fee_amount);
      const reference =
        typeof row.data.reference === "string" ? row.data.reference : null;

      return paymentReceivedEmail({
        audience: row.audience,
        amountDisplay: amount,
        studentName: context?.studentName,
        courseTitle: context?.courseTitle,
        tutorName: context?.tutorName,
        confirmed: context?.confirmed,
        reference,
        feeDisplay: fee != null ? formatGhs(fee) : null,
        totalDisplay:
          net != null && fee != null ? formatGhs(net + fee) : null,
      });
    }
    case "payment.group_joined":
      return groupJoinedEmail({
        groupId: typeof row.data.group_id === "string" ? row.data.group_id : "",
        studentName: group?.studentName,
        groupName: group?.groupName,
        courseName: group?.courseName,
      });
    case "request.received":
      return tutorRequestEmail({
        kind: "received",
        studentName: request?.studentName,
        tutorName: request?.tutorName,
        courseTitle: request?.courseTitle,
      });
    case "request.accepted":
      return tutorRequestEmail({
        kind: "accepted",
        studentName: request?.studentName,
        tutorName: request?.tutorName,
        courseTitle: request?.courseTitle,
      });
    case "request.declined":
      return tutorRequestEmail({
        kind: "declined",
        studentName: request?.studentName,
        tutorName: request?.tutorName,
        courseTitle: request?.courseTitle,
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
    case "payment.payout_transferring":
      return payoutStatusEmail({ status: "transferring", amountDisplay: amount });
    case "payment.payout_paid":
      return payoutStatusEmail({ status: "paid", amountDisplay: amount });
    case "payment.payout_held":
      return payoutStatusEmail({
        status: "held",
        amountDisplay: amount,
        reason: typeof row.data.reason === "string" ? row.data.reason : null,
      });
    case "payment.payout_failed":
      return payoutStatusEmail({
        status: "failed",
        amountDisplay: amount,
        reason: typeof row.data.reason === "string" ? row.data.reason : null,
      });
    case "payment.payout_account_verified":
      return payoutStatusEmail({ status: "account_verified", amountDisplay: "" });
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

  const contextCache = new Map<string, PaymentContext | null>();
  const requestCache = new Map<string, RequestContext | null>();

  for (const row of rows) {
    try {
      // Payment emails name the student/course/tutor; resolve that once per
      // engagement (three outbox rows — student, tutor, admin — share one).
      // Request rows queue only a request_id, so their names resolve here.
      const context =
        row.type === "payment.received"
          ? await paymentContext(row.engagement_id, contextCache)
          : null;
      const request = REQUEST_TYPES.has(row.type)
        ? await requestContext(
            typeof row.data.request_id === "string" ? row.data.request_id : "",
            requestCache,
          )
        : null;
      const group =
        row.type === "payment.group_joined" &&
        typeof row.data.group_id === "string" &&
        typeof row.data.student_id === "string"
          ? await groupJoinedContext(row.data.group_id, row.data.student_id)
          : null;
      const email = buildEmail(row, context, request, group);
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
