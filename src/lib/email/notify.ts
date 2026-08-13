import { after } from "next/server";
import { EMAIL_FROM, getEmailClient, isEmailConfigured, APP_URL } from "./client";
import { adminEmails, emailsForProfiles } from "./recipients";
import {
  attendanceConfirmedEmail,
  newMessageEmail,
  passwordResetEmail,
  sessionCancelledEmail,
  sessionScheduledEmail,
  tutorApplicationEmail,
  tutorReviewEmail,
  type EmailMessage,
} from "./templates";

/**
 * Email notification dispatchers.
 *
 * Every function here is BEST-EFFORT by design: it must never throw, never
 * block the caller, and never fail the primary action if email breaks. All
 * sends run after the response via Next's `after()`.
 */

/** Best-effort send; returns the error string (or null) instead of throwing. */
async function deliver(to: string, message: EmailMessage): Promise<string | null> {
  const client = getEmailClient();
  if (!client) return "Email isn't configured (missing RESEND_API_KEY).";
  try {
    await client.emails.send({
      from: EMAIL_FROM,
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return null;
  } catch (err) {
    const reason =
      (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message ?? (err as Error).message;
    console.error(`[email] failed to send "${message.subject}" to ${to}`, err);
    return reason || "Unknown email error";
  }
}

/** Run a send after the response has been flushed (never blocks the action).
 *  The callback swallows its own errors — email must never crash the app. */
function afterResponse(send: () => Promise<void>): void {
  if (!isEmailConfigured()) return;
  const run = () => {
    void send().catch((err) => {
      console.error("[email] notification failed", err);
    });
  };
  try {
    after(run);
  } catch {
    // `after` can throw outside a request scope (e.g. static generation) —
    // fall back to fire-and-forget.
    run();
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function notifyNewMessage(opts: {
  recipientProfileIds: string[];
  senderName: string;
  body: string;
  conversationId: string;
}): void {
  const chatUrl = `${APP_URL}/chat?c=${opts.conversationId}`;
  afterResponse(async () => {
    const emails = await emailsForProfiles(opts.recipientProfileIds);
    const message = newMessageEmail({
      senderName: opts.senderName,
      preview: opts.body,
      chatUrl,
    });
    await Promise.all([...emails.values()].map((to) => deliver(to, message)));
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function notifySessionScheduled(opts: {
  studentProfileId: string;
  tutorName: string;
  studentName: string;
  when: string;
  topic: string | null;
  location: string | null;
}): void {
  const dashboardUrl = `${APP_URL}/dashboard`;
  afterResponse(async () => {
    const emails = await emailsForProfiles([opts.studentProfileId]);
    const message = sessionScheduledEmail({
      tutorName: opts.tutorName,
      studentName: opts.studentName,
      when: opts.when,
      topic: opts.topic,
      location: opts.location,
      dashboardUrl,
    });
    await Promise.all([...emails.values()].map((to) => deliver(to, message)));
  });
}

export function notifySessionCancelled(opts: {
  recipientProfileIds: string[];
  cancelledByName: string;
  when: string;
  topic: string | null;
}): void {
  const dashboardUrl = `${APP_URL}/dashboard`;
  afterResponse(async () => {
    const emails = await emailsForProfiles(opts.recipientProfileIds);
    const message = sessionCancelledEmail({
      cancelledByName: opts.cancelledByName,
      when: opts.when,
      topic: opts.topic,
      dashboardUrl,
    });
    await Promise.all([...emails.values()].map((to) => deliver(to, message)));
  });
}

/** Admins are told when attendance is ticked — the whole point of the dual
 *  tick is proving the tutor is actually doing the job. The tickers already
 *  see the result in-app, so only the admin team is emailed. */
export function notifyAttendanceTicked(opts: {
  tutorName: string;
  studentName: string;
  when: string;
  topic: string | null;
  confirmedBy: string;
  tutorTick: boolean;
  studentTick: boolean;
}): void {
  const adminUrl = `${APP_URL}/admin`;
  afterResponse(async () => {
    const admins = await adminEmails();
    const message = attendanceConfirmedEmail({
      tutorName: opts.tutorName,
      studentName: opts.studentName,
      when: opts.when,
      topic: opts.topic,
      confirmedBy: opts.confirmedBy,
      tutorTick: opts.tutorTick,
      studentTick: opts.studentTick,
      adminUrl,
    });
    await Promise.all(admins.map((to) => deliver(to, message)));
  });
}

// ---------------------------------------------------------------------------
// Tutor lifecycle
// ---------------------------------------------------------------------------

export function notifyTutorApplication(opts: { tutorName: string }): void {
  const adminUrl = `${APP_URL}/admin`;
  afterResponse(async () => {
    const admins = await adminEmails();
    const message = tutorApplicationEmail({ tutorName: opts.tutorName, adminUrl });
    await Promise.all(admins.map((to) => deliver(to, message)));
  });
}

export function notifyTutorReviewed(opts: {
  recipientProfileId: string;
  approved: boolean;
  note: string | null;
}): void {
  const tutorUrl = `${APP_URL}/tutor`;
  afterResponse(async () => {
    const emails = await emailsForProfiles([opts.recipientProfileId]);
    const message = tutorReviewEmail({
      approved: opts.approved,
      note: opts.note,
      tutorUrl,
    });
    await Promise.all([...emails.values()].map((to) => deliver(to, message)));
  });
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * The one-time code, emailed straight to the user instead of out-of-band.
 * AWAITED (not `after()`) so the caller can surface send failures to the
 * user — for password reset it's worth the few hundred ms to know whether
 * the code actually left. Returns null on success or the error message.
 */
export async function notifyPasswordReset(opts: {
  email: string;
  code: string;
}): Promise<string | null> {
  const resetUrl = `${APP_URL}/forgot-password`;
  return deliver(opts.email, passwordResetEmail({ code: opts.code, resetUrl }));
}
