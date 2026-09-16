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

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
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

/** Plain <p> with the brand's muted purple. Expects pre-escaped/HTML input. */
function p(text: string): string {
  return `<p style="margin:0 0 12px;color:#3A2B4A;font-size:14px;line-height:1.6;">${text}</p>`;
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
// Sessions (timetable)
// ---------------------------------------------------------------------------

export function sessionScheduledEmail(opts: {
  tutorName: string;
  studentName: string;
  when: string;
  topic: string | null;
  location: string | null;
  dashboardUrl: string;
}): EmailMessage {
  const subject = `Session scheduled: ${opts.topic ?? "Tutoring"} · ${opts.when}`;
  const lines = [
    `A new session has been scheduled for you.`,
    ``,
    `  Tutor:    ${opts.tutorName}`,
    `  Student:  ${opts.studentName}`,
    `  When:     ${opts.when}`,
    opts.topic ? `  Topic:    ${opts.topic}` : ``,
    opts.location ? `  Where:    ${opts.location}` : ``,
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
    )}${actionButton(opts.dashboardUrl, "View my timetable")}`,
  );
  return { subject, text, html };
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
