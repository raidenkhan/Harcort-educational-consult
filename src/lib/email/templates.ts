/**
 * Email templates — pure functions that build { subject, text, html } for
 * every notification type. Keeping them pure (no env, no DB, no date math)
 * makes them trivially unit-testable.
 *
 * The HTML wrapper is intentionally minimal + inline-styled — email clients
 * strip external stylesheets, so everything must be inline and table-based.
 *
 * ⚠️ SECURITY: names, message bodies, topics and admin notes are all
 * attacker-controllable free text. Every dynamic value interpolated into
 * `html` goes through `escapeHtml()` — otherwise a student could name
 * themselves `<img src=x onerror=…>` and land markup in an admin's inbox.
 */

import { googleCalendarUrl, sessionIcs } from "@/lib/calendarLink";

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
  /** Optional files attached to the email (Resend shape: base64 content). */
  attachments?: { filename: string; content: string; contentType?: string }[];
}

/** Escape a value for safe interpolation into HTML (text or attribute). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shared branded HTML shell (deep-navy ink #1C0F2B, purple accent #610B96). */
function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F5F1FA;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F1FA;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="background:#1C0F2B;border-radius:16px 16px 0 0;padding:20px 28px;">
              <span style="color:#D1B4EF;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Harcourt Educational Consult</span>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px;">
              <h1 style="margin:0 0 16px;color:#1C0F2B;font-size:20px;line-height:1.3;">${escapeHtml(title)}</h1>
              ${bodyHtml}
              <hr style="border:none;border-top:1px solid #EFE7F7;margin:24px 0 16px;" />
              <p style="margin:0;color:#8A7A9B;font-size:12px;line-height:1.5;">
                You're receiving this because you have an account on Harcourt
                Educational Consult. Questions? Reply to this email or contact
                the admin team.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function actionButton(href: string, label: string): string {
  // Defence in depth — never emit a non-http(s) href (e.g. javascript:), even
  // if one of these URLs is ever built from user data.
  const safeHref = /^https?:\/\//i.test(href) ? href : "#";
  return `<p style="margin:20px 0 0;"><a href="${escapeHtml(safeHref)}" style="display:inline-block;background:#610B96;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

/** A quiet text link (secondary action beneath the primary button). */
function textLink(href: string, label: string): string {
  const safeHref = /^https?:\/\//i.test(href) ? href : "#";
  return `<a href="${escapeHtml(safeHref)}" style="color:#610B96;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>`;
}

/** Plain <p> with the brand's muted purple. Expects pre-escaped/HTML input. */
function p(text: string): string {
  return `<p style="margin:0 0 12px;color:#3A2B4A;font-size:14px;line-height:1.6;">${text}</p>`;
}

/** A compact two-column detail table (label left, value right). Empty values
 *  are dropped so a thin row never prints a dangling label. Every value is
 *  escaped here — callers pass raw names/course titles. */
function detailTable(rows: Array<{ label: string; value: string }>): string {
  const cells = rows
    .filter((row) => row.value.trim().length > 0)
    .map(
      (row) => `<tr>
        <td style="padding:7px 0;color:#8A7A9B;font-size:13px;">${escapeHtml(row.label)}</td>
        <td style="padding:7px 0;color:#1C0F2B;font-size:13px;font-weight:600;text-align:right;">${escapeHtml(row.value)}</td>
      </tr>`,
    )
    .join("");
  if (!cells) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-top:1px solid #EFE7F7;border-bottom:1px solid #EFE7F7;">${cells}</table>`;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function newMessageEmail(opts: {
  senderName: string;
  preview: string;
  chatUrl: string;
}): EmailMessage {
  const preview =
    opts.preview.length > 160 ? `${opts.preview.slice(0, 157)}…` : opts.preview;
  const subject = `New message from ${opts.senderName}`;
  const text = `${opts.senderName} sent you a message on Harcourt Educational Consult:\n\n"${preview}"\n\nOpen the conversation: ${opts.chatUrl}`;
  const html = wrap(
    `New message from ${opts.senderName}`,
    `${p(`<strong>${escapeHtml(opts.senderName)}</strong> sent you a message:`)}${p(
      `<em>"${escapeHtml(preview)}"</em>`,
    )}${actionButton(opts.chatUrl, "Open conversation")}`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Study groups
// ---------------------------------------------------------------------------

export function studyGroupMessageEmail(opts: {
  senderName: string;
  groupName: string;
  preview: string;
  groupUrl: string;
}): EmailMessage {
  const preview =
    opts.preview.length > 160 ? `${opts.preview.slice(0, 157)}…` : opts.preview;
  const subject = `New message in ${opts.groupName}`;
  const text = `${opts.senderName} posted in the study group "${opts.groupName}":\n\n"${preview}"\n\nOpen the group: ${opts.groupUrl}`;
  const html = wrap(
    `New message in ${opts.groupName}`,
    `${p(`<strong>${escapeHtml(opts.senderName)}</strong> posted in <strong>${escapeHtml(opts.groupName)}</strong>:`)}${p(
      `<em>"${escapeHtml(preview)}"</em>`,
    )}${actionButton(opts.groupUrl, "Open the group")}`,
  );
  return { subject, text, html };
}

/**
 * A tutor (or admin) added the recipient to a study group.
 *
 * This is the "how do the students get the group" path: before 0036 the only
 * way in was a code the student had to be told out-of-band. The email says who
 * added them and what the group is for, so the link is self-explanatory even
 * when it lands days later.
 */
export function studyGroupAddedEmail(opts: {
  tutorName: string;
  groupName: string;
  courseName: string | null;
  groupUrl: string;
}): EmailMessage {
  const course = opts.courseName ? ` for ${opts.courseName}` : "";
  const subject = `${opts.tutorName} added you to ${opts.groupName}`;
  const text = `${opts.tutorName} added you to the study group "${opts.groupName}"${course} on Harcourt Educational Consult.\n\nOpen the group: ${opts.groupUrl}`;
  const html = wrap(
    `You're in ${opts.groupName}`,
    `${p(`<strong>${escapeHtml(opts.tutorName)}</strong> added you to the study group <strong>${escapeHtml(opts.groupName)}</strong>${opts.courseName ? ` for ${escapeHtml(opts.courseName)}` : ""}.`)}${p(
      "Open the group to see what your coursemates are discussing — you can reply there.",
    )}${actionButton(opts.groupUrl, "Open the group")}`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Sessions (timetable)
// ---------------------------------------------------------------------------

export function sessionScheduledEmail(opts: {
  tutorName: string;
  studentName: string;
  when: string;
  topic: string | null;
  location: string | null;
  /** Calendar event title, e.g. "Tutoring with Ama — Mechanics". */
  title: string;
  start: Date;
  end: Date;
  /** Creation stamp + unique id for the .ics attachment. */
  now: Date;
  uid: string;
  dashboardUrl: string;
}): EmailMessage {
  const subject = `Session scheduled: ${opts.topic ?? "Tutoring"} · ${opts.when}`;
  const details = "Scheduled on Harcourt Educational Consult.";

  const calendarUrl = googleCalendarUrl({
    title: opts.title,
    start: opts.start,
    end: opts.end,
    location: opts.location ?? undefined,
    details,
  });

  // The .ics works everywhere (Apple Calendar, Outlook, and Google too), so it
  // covers the clients the Google-only link misses. Base64 for Resend.
  const ics = sessionIcs({
    title: opts.title,
    start: opts.start,
    end: opts.end,
    location: opts.location ?? undefined,
    description: details,
    uid: opts.uid,
    now: opts.now,
  });
  const attachments = [
    {
      filename: "session.ics",
      content: Buffer.from(ics, "utf-8").toString("base64"),
      contentType: "text/calendar; charset=utf-8",
    },
  ];

  const lines = [
    `A new session has been scheduled for you.`,
    ``,
    `  Tutor:    ${opts.tutorName}`,
    `  Student:  ${opts.studentName}`,
    `  When:     ${opts.when}`,
    opts.topic ? `  Topic:    ${opts.topic}` : ``,
    opts.location ? `  Where:    ${opts.location}` : ``,
    ``,
    `Add it to your calendar: ${calendarUrl}`,
    ``,
    `A calendar file (.ics) is attached — open it to add the session to Apple Calendar or Outlook.`,
    ``,
    `It's on your timetable — remember to tick attendance when you meet.`,
  ];
  const text = lines.filter(Boolean).join("\n");
  const html = wrap(
    `New session scheduled`,
    `${p(`<strong>${escapeHtml(opts.tutorName)}</strong> scheduled a session with <strong>${escapeHtml(opts.studentName)}</strong>.`)}${p(
      `When: <strong>${escapeHtml(opts.when)}</strong><br/>${
        opts.topic ? `Topic: ${escapeHtml(opts.topic)}<br/>` : ""
      }${opts.location ? `Where: ${escapeHtml(opts.location)}` : ""}`,
    )}${actionButton(calendarUrl, "Add to Google Calendar")}${p(
      `A calendar file (<code>.ics</code>) is attached — open it to add the session to <strong>Apple Calendar</strong> or <strong>Outlook</strong>.`,
    )}${p(textLink(opts.dashboardUrl, "View my timetable →"))}`,
  );
  return { subject, text, html, attachments };
}

export function sessionCancelledEmail(opts: {
  cancelledByName: string;
  when: string;
  topic: string | null;
  dashboardUrl: string;
}): EmailMessage {
  const subject = `Session cancelled: ${opts.topic ?? "Tutoring"} · ${opts.when}`;
  const text = `The session scheduled for ${opts.when} was cancelled by ${opts.cancelledByName}.\n\nCheck your timetable: ${opts.dashboardUrl}`;
  const html = wrap(
    `A session was cancelled`,
    `${p(`<strong>${escapeHtml(opts.cancelledByName)}</strong> cancelled the session scheduled for <strong>${escapeHtml(opts.when)}</strong>.`)}${actionButton(
      opts.dashboardUrl,
      "View my timetable",
    )}`,
  );
  return { subject, text, html };
}

/** Sent to admins when a session is ticked — proves the tutor is working. */
export function attendanceConfirmedEmail(opts: {
  tutorName: string;
  studentName: string;
  when: string;
  topic: string | null;
  confirmedBy: string;
  tutorTick: boolean;
  studentTick: boolean;
  adminUrl: string;
}): EmailMessage {
  const ticks = [];
  if (opts.tutorTick) ticks.push("Tutor ✓");
  if (opts.studentTick) ticks.push("Student ✓");
  const subject = `Attendance ticked: ${opts.studentName} & ${opts.tutorName} · ${opts.when}`;
  const text = `${opts.confirmedBy} confirmed attendance for the session "${opts.topic ?? "Tutoring"}" (${opts.when}).\n\nTicks so far: ${ticks.join(", ") || "none"}\n\nAttendance tracker: ${opts.adminUrl}`;
  const html = wrap(
    `Attendance ticked`,
    `${p(
      `<strong>${escapeHtml(opts.confirmedBy)}</strong> confirmed attendance for the session with <strong>${escapeHtml(opts.studentName)}</strong> and <strong>${escapeHtml(opts.tutorName)}</strong> (${escapeHtml(opts.when)}).`,
    )}${p(`Ticks so far: <strong>${ticks.join(", ") || "none"}</strong>`)}${actionButton(
      opts.adminUrl,
      "Open attendance tracker",
    )}`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Tutor lifecycle (admin side)
// ---------------------------------------------------------------------------

/** Sent to admins when a tutor submits a profile for review. */
export function tutorApplicationEmail(opts: {
  tutorName: string;
  adminUrl: string;
}): EmailMessage {
  const subject = `New tutor application: ${opts.tutorName}`;
  const text = `${opts.tutorName} submitted a tutor profile and is waiting for review.\n\nReview it: ${opts.adminUrl}`;
  const html = wrap(
    `New tutor application`,
    `${p(`<strong>${escapeHtml(opts.tutorName)}</strong> submitted a tutor profile and is waiting for your review.`)}${actionButton(
      opts.adminUrl,
      "Review applications",
    )}`,
  );
  return { subject, text, html };
}

/** Sent to the tutor when an admin approves/rejects their profile. */
export function tutorReviewEmail(opts: {
  approved: boolean;
  note: string | null;
  tutorUrl: string;
}): EmailMessage {
  const subject = opts.approved
    ? "Your tutor profile was approved"
    : "Your tutor profile was not approved";
  const text = opts.approved
    ? `Great news — your tutor profile was approved! Students can now find you and book sessions.\n\n${opts.note ? `Note from the admin: ${opts.note}\n\n` : ""}Your tutor page: ${opts.tutorUrl}`
    : `Your tutor profile was not approved.\n\n${opts.note ? `Reason: ${opts.note}\n\n` : ""}You can update your profile and resubmit for review: ${opts.tutorUrl}`;
  const html = wrap(
    opts.approved ? "You're approved!" : "Application not approved",
    opts.approved
      ? `${p(`Great news — your tutor profile was <strong>approved</strong>! Students can now find you and book sessions.`)}${opts.note ? p(`Note from the admin: <em>${escapeHtml(opts.note)}</em>`) : ""}${actionButton(opts.tutorUrl, "Open my tutor page")}`
      : `${p(`Your tutor profile was <strong>not approved</strong>.`)}${opts.note ? p(`Reason: <em>${escapeHtml(opts.note)}</em>`) : ""}${p(`You can update your profile and resubmit for review.`)}${actionButton(opts.tutorUrl, "Update my profile")}`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/** The one-time reset code, sent straight to the user. */
export function passwordResetEmail(opts: {
  code: string;
  resetUrl: string;
}): EmailMessage {
  const subject = "Your password reset code";
  const text = `Your one-time password reset code is:\n\n  ${opts.code}\n\nIt expires in 30 minutes. Redeem it here: ${opts.resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`;
  const html = wrap(
    "Password reset code",
    `${p(`Your one-time password reset code is:`)}<p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:6px;color:#610B96;">${escapeHtml(opts.code)}</p>${p(
      `It expires in 30 minutes.`,
    )}${actionButton(opts.resetUrl, "Reset my password")}`,
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Tutor requests (drained from notification_outbox — see lib/email/outbox.ts)
// ---------------------------------------------------------------------------

/**
 * A tutor request moved state.
 *
 * All three kinds are queued in the SAME transaction as the row change by the
 * request RPCs (migrations 0012 and 0024), so the notification can never be
 * lost — but `buildEmail` had no case for them, so every one of these rows was
 * discarded as "unbuildable" and marked sent. A tutor was never told a student
 * had asked for them, and a student was never told their request was answered.
 */
export function tutorRequestEmail(opts: {
  kind: "received" | "accepted" | "declined";
  /** Names/course resolved from the request (best-effort; may be empty). */
  studentName?: string | null;
  tutorName?: string | null;
  courseTitle?: string | null;
}): EmailMessage {
  const student = opts.studentName?.trim() || "A student";
  const tutor = opts.tutorName?.trim() || "your tutor";
  const course = opts.courseTitle?.trim() || "this course";
  const origin = process.env.APP_URL ?? "";

  // The tutor answers on their dashboard; the student manages requests on
  // theirs — a declined request sends them back to the directory.
  const href =
    opts.kind === "received"
      ? `${origin}/tutor`
      : opts.kind === "declined"
        ? `${origin}/tutors`
        : `${origin}/dashboard`;

  const headline =
    opts.kind === "received"
      ? "New tutor request"
      : opts.kind === "accepted"
        ? "Request accepted"
        : "Request declined";

  const intro =
    opts.kind === "received"
      ? `<strong>${escapeHtml(student)}</strong> asked you to tutor them in <strong>${escapeHtml(course)}</strong>. Open your dashboard to accept or decline.`
      : opts.kind === "accepted"
        ? `<strong>${escapeHtml(tutor)}</strong> accepted your request for <strong>${escapeHtml(course)}</strong>. They'll get in touch to schedule your sessions.`
        : `<strong>${escapeHtml(tutor)}</strong> isn't taking <strong>${escapeHtml(course)}</strong>. You can request another tutor from the directory.`;

  const subject =
    opts.kind === "received"
      ? `New request: ${student} — ${course}`
      : opts.kind === "accepted"
        ? `Request accepted: ${course}`
        : `Request declined: ${course}`;

  const text =
    opts.kind === "received"
      ? `${student} asked you to tutor them in ${course}.`
      : opts.kind === "accepted"
        ? `${tutor} accepted your request for ${course}.`
        : `${tutor} declined your request for ${course}.`;

  return {
    subject,
    text: `${text}\n\n${href}`,
    html: wrap(headline, `${p(intro)}${actionButton(href, "Open my dashboard")}`),
  };
}

// Payments (drained from notification_outbox — see lib/email/outbox.ts)
// ---------------------------------------------------------------------------

/** Audience → the page they should land on. */
function paymentUrl(audience: string): string {
  if (audience === "tutor") return `${process.env.APP_URL ?? ""}/tutor`;
  if (audience === "admin") return `${process.env.APP_URL ?? ""}/admin`;
  return `${process.env.APP_URL ?? ""}/dashboard`;
}

/**
 * A payment landed — student, tutor, and admins are all told.
 *
 * 0029 is 100% upfront, so the old "(installment N of 2)" copy was a lie.
 * The email now names the people and the course, and says what the money
 * means: for a fully paid booking there is nothing for the tutor to approve.
 */
export function paymentReceivedEmail(opts: {
  audience: "student" | "tutor" | "admin";
  amountDisplay: string;
  /** Names/course resolved from the engagement (best-effort; may be empty). */
  studentName?: string | null;
  courseTitle?: string | null;
  tutorName?: string | null;
  /** True when the agreement is active — i.e. the booking is confirmed. */
  confirmed?: boolean;
}): EmailMessage {
  const url = paymentUrl(opts.audience);
  const student = opts.studentName?.trim() || "A student";
  const course = opts.courseTitle?.trim() || "your course";
  const tutor = opts.tutorName?.trim() || "your tutor";
  const confirmed = opts.confirmed === true;

  const intro =
    opts.audience === "student"
      ? confirmed
        ? "Your payment was received and your booking is <strong>confirmed</strong>. You don't need to wait for your tutor to approve it — they've been notified and will schedule your sessions with you."
        : "Your payment was received and added to your course agreement. Thank you."
      : opts.audience === "tutor"
        ? confirmed
          ? `<strong>${escapeHtml(student)}</strong> paid for <strong>${escapeHtml(course)}</strong>. The booking is <strong>confirmed automatically</strong> — there is nothing to approve. It is on your dashboard now.`
          : `<strong>${escapeHtml(student)}</strong> made a payment toward <strong>${escapeHtml(course)}</strong>. It has been added to the agreement.`
        : `<strong>${escapeHtml(student)}</strong> paid <strong>${escapeHtml(opts.amountDisplay)}</strong> for <strong>${escapeHtml(course)}</strong>.`;

  const details = detailTable([
    { label: "Student", value: opts.studentName ?? "" },
    { label: "Course", value: opts.courseTitle ?? "" },
    { label: "Tutor", value: opts.tutorName ?? "" },
    { label: "Amount received", value: opts.amountDisplay },
    { label: "Status", value: confirmed ? "Paid — booking confirmed" : "Payment received" },
  ]);

  const subject =
    opts.audience === "tutor"
      ? `Payment received: ${student} — ${opts.amountDisplay}`
      : `Payment received: ${opts.amountDisplay}`;

  const text = [
    opts.audience === "student"
      ? `Payment received: ${opts.amountDisplay} for ${course} with ${tutor}.`
      : opts.audience === "tutor"
        ? `${student} paid ${opts.amountDisplay} for ${course}.`
        : `${student} paid ${opts.amountDisplay} for ${course} (tutor: ${tutor}).`,
    confirmed
      ? "The booking is confirmed — no approval is needed."
      : "The payment has been added to the agreement.",
    url,
  ].join("\n\n");

  const label =
    opts.audience === "admin"
      ? "Open payments"
      : opts.audience === "tutor"
        ? "Open my dashboard"
        : "Open my dashboard";

  return {
    subject,
    text,
    html: wrap(
      "Payment received",
      `${p(intro)}${details}${actionButton(url, label)}`,
    ),
  };
}

/** A student committed to a tutor's quoted course (installment plan opened). */
export function paymentEngagementCreatedEmail(opts: {
  audience: "tutor" | "admin";
}): EmailMessage {
  const url = paymentUrl(opts.audience);
  return {
    subject: "New payment agreement",
    text: `A student opened a payment agreement with installment deadlines. ${url}`,
    html: wrap(
      "New payment agreement",
      `${p(
        opts.audience === "tutor"
          ? `A student committed to your quoted course price. You'll be notified as each installment lands.`
          : `A new student–tutor payment agreement was created.`,
      )}${actionButton(url, opts.audience === "tutor" ? "Open my tutor page" : "Open the admin console")}`,
    ),
  };
}

/** Enough money has landed (0029: full payment, or an admin-recorded plan)
 *  — sessions can be scheduled/attended against the agreement. */
export function paymentEngagementActivatedEmail(opts: {
  audience: "tutor" | "admin";
}): EmailMessage {
  const url = paymentUrl(opts.audience);
  return {
    subject: "Agreement active — payment received",
    text: `A payment was received and the agreement is now active. ${url}`,
    html: wrap(
      "Agreement active",
      `${p(`A <strong>payment was received</strong> — the agreement is now <strong>active</strong>.`)}${actionButton(url, opts.audience === "tutor" ? "Open my tutor page" : "Open the admin console")}`,
    ),
  };
}

/** Deadline passed without payment — everyone hears about it. */
export function paymentOverdueEmail(opts: {
  audience: "student" | "tutor" | "admin";
  installmentIdx: number;
  amountDisplay: string;
}): EmailMessage {
  const url = paymentUrl(opts.audience);
  const line =
    opts.audience === "student"
      ? `Your installment ${opts.installmentIdx} of 2 (<strong>${escapeHtml(opts.amountDisplay)}</strong>) is <strong>overdue</strong>. Pay as soon as possible to keep your sessions going.`
      : opts.audience === "tutor"
        ? `Installment ${opts.installmentIdx} of 2 (<strong>${escapeHtml(opts.amountDisplay)}</strong>) is <strong>overdue</strong> on one of your engagements.`
        : `Installment ${opts.installmentIdx} of 2 (<strong>${escapeHtml(opts.amountDisplay)}</strong>) is overdue.`;
  return {
    subject: `Overdue payment: ${opts.amountDisplay}`,
    text: `Installment ${opts.installmentIdx} of 2 (${opts.amountDisplay}) is overdue. ${url}`,
    html: wrap("Payment overdue", `${p(line)}${actionButton(url, opts.audience === "admin" ? "Open payments" : "Open my dashboard")}`),
  };
}

/** Payout lifecycle — requested / approved / transferring / paid / held / failed. */
export function payoutStatusEmail(opts: {
  status: "requested" | "approved" | "transferring" | "paid" | "held" | "failed" | "account_verified";
  amountDisplay: string;
  reason?: string | null;
}): EmailMessage {
  const url = paymentUrl("tutor");
  const map = {
    requested: {
      subject: `Payout requested: ${opts.amountDisplay}`,
      title: "Payout requested",
      line: `Your payout request of <strong>${escapeHtml(opts.amountDisplay)}</strong> was submitted${opts.reason?.includes("overdue_history") || opts.reason?.includes("cancelled_sessions") ? " and is queued for review" : ""}.`,
    },
    approved: {
      subject: `Payout approved: ${opts.amountDisplay}`,
      title: "Payout approved",
      line: `Your payout of <strong>${escapeHtml(opts.amountDisplay)}</strong> was approved and the transfer is on its way to your mobile money account.`,
    },
    transferring: {
      subject: `Payout transfer started: ${opts.amountDisplay}`,
      title: "Transfer started",
      line: `Your payout of <strong>${escapeHtml(opts.amountDisplay)}</strong> has been sent to Paystack — the mobile money transfer is in flight and lands shortly.`,
    },
    paid: {
      subject: `Payout sent: ${opts.amountDisplay}`,
      title: "Payout sent",
      line: `<strong>${escapeHtml(opts.amountDisplay)}</strong> was sent to your mobile money account.`,
    },
    held: {
      subject: "Payout on hold",
      title: "Payout on hold",
      line: `Your payout of <strong>${escapeHtml(opts.amountDisplay)}</strong> is on hold${opts.reason ? `: <em>${escapeHtml(opts.reason)}</em>` : ""}. Contact the Harcourt team for details.`,
    },
    failed: {
      subject: `Payout transfer failed: ${opts.amountDisplay}`,
      title: "Transfer failed",
      line: `The mobile money transfer of <strong>${escapeHtml(opts.amountDisplay)}</strong> did not go through${opts.reason ? `: <em>${escapeHtml(opts.reason)}</em>` : ""}. The team has been notified and will retry — contact support if unsure.`,
    },
    account_verified: {
      subject: "Payout account verified",
      title: "Payout account verified",
      line: "Your mobile money account was verified — you can request payouts once your sessions are complete and every installment is paid.",
    },
  }[opts.status];
  const summary = opts.amountDisplay
    ? `${map.title}: ${opts.amountDisplay}.`
    : `${map.title}.`;
  return {
    subject: map.subject,
    text: `${summary} ${url}`,
    html: wrap(map.title, `${p(map.line)}${actionButton(url, "Open my tutor page")}`),
  };
}

/** Emailed to admins when a user files a report (so it never sits unseen). */
export function reportFiledEmail(opts: {
  reporterName: string;
  targetType: string;
  reasonPreview: string;
}): EmailMessage {
  const subject = `New report filed: ${opts.targetType}`;
  const text = `${opts.reporterName} filed a report about a ${opts.targetType}.\n\n"${opts.reasonPreview}"\n\nReview it in the admin console.`;
  const html = wrap(
    "New report filed",
    `${p(`<strong>${escapeHtml(opts.reporterName)}</strong> filed a report about a <strong>${escapeHtml(opts.targetType)}</strong>.`)}${p(`<em>"${escapeHtml(opts.reasonPreview)}"</em>`)}${actionButton(`${process.env.APP_URL ?? ""}/admin/support`, "Review reports")}`,
  );
  return { subject, text, html };
}

/** Emailed to the reporter when their report is resolved or dismissed. */
export function reportResolvedEmail(opts: {
  decision: "resolved" | "dismissed";
  targetType: string;
  note: string | null;
}): EmailMessage {
  const subject =
    opts.decision === "resolved"
      ? "Your report was resolved"
      : "Update on your report";
  const headline =
    opts.decision === "resolved"
      ? "We've reviewed the reported content and taken action."
      : "We've reviewed the reported content. After looking into it, we didn't find a violation of our rules — but we appreciate you flagging it.";
  const text = `${headline}${opts.note ? `\n\nNote from the team: ${opts.note}` : ""}\n\nThank you for helping keep Harcourt safe.`;
  const html = wrap(
    "Update on your report",
    `${p(headline)}${opts.note ? p(`Note from the team: <em>${escapeHtml(opts.note)}</em>`) : ""}${p("Thank you for helping keep Harcourt safe.")}`,
  );
  return { subject, text, html };
}
