/**
 * Pure wording rules for in-app notifications (unit-tested). Kept apart from
 * the database code so the copy can be checked without Supabase.
 */

export interface NotificationCopy {
  title: string;
  body: string | null;
  link: string;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

/** What an unpaid student has (or hasn't) picked, for the reminder wording. */
export interface UnpaidSelection {
  courseTitle: string;
  tutorName: string;
}

/**
 * The admin's payment reminder. Two situations, two messages: a student who
 * already picked a course is told exactly what is waiting and sent to pay; a
 * student who picked nothing is nudged to choose a course and tutor.
 */
export function paymentReminderCopy(
  firstName: string,
  selections: UnpaidSelection[],
): NotificationCopy {
  const hi = firstName ? `Hi ${firstName}, ` : "";
  if (selections.length === 0) {
    return {
      title: "Pick a course to get started",
      body: `${hi}you're registered but haven't booked a tutor yet. Choose your course and a tutor, then pay to lock in your sessions.`,
      link: "/courses",
    };
  }
  const [first] = selections;
  const what =
    selections.length === 1
      ? `${first.courseTitle} with ${first.tutorName}`
      : `${first.courseTitle} with ${first.tutorName} and ${selections.length - 1} more`;
  return {
    title: "Complete your payment to confirm your booking",
    body: `${hi}${what} is waiting for payment. Your sessions are confirmed as soon as it's paid.`,
    link: "/dashboard/payments",
  };
}

/** Outbox (payments) events → in-app copy, for the recipient's side only. */
export function outboxNotificationCopy(row: {
  type: string;
  audience: "student" | "tutor" | "admin";
  /** The email subject the drain already built, reused as the title. */
  subject: string;
}): NotificationCopy | null {
  if (row.audience === "admin") return null;
  const tutor = row.audience === "tutor";
  const linkFor: Record<string, string> = {
    "payment.received": tutor ? "/tutor/earnings" : "/dashboard/payments",
    "payment.engagement_activated": tutor ? "/tutor" : "/dashboard/payments",
    "payment.engagement_created": tutor ? "/tutor" : "/dashboard/payments",
    "payment.plan_created": "/dashboard/payments",
    "payment.overdue": "/dashboard/payments",
    "payment.group_joined": "/groups",
    "request.received": "/tutor",
    "request.accepted": "/dashboard",
    "request.declined": "/dashboard",
    "payment.payout_requested": "/tutor/earnings",
    "payment.payout_approved": "/tutor/earnings",
    "payment.payout_transferring": "/tutor/earnings",
    "payment.payout_paid": "/tutor/earnings",
    "payment.payout_held": "/tutor/earnings",
    "payment.payout_failed": "/tutor/earnings",
    "payment.payout_account_verified": "/tutor/earnings",
  };
  const link = linkFor[row.type];
  if (!link) return null;
  return {
    // Email subjects can carry a "Receipt:" style prefix; keep them as-is —
    // they're already written for this recipient.
    title: clip(row.subject, 200),
    body: null,
    link,
  };
}

export function newMessageCopy(opts: {
  senderName: string;
  body: string;
  conversationId: string;
}): NotificationCopy {
  return {
    title: `New message from ${opts.senderName}`,
    body: clip(opts.body.replace(/\s+/g, " ").trim(), 140),
    link: `/chat?c=${opts.conversationId}`,
  };
}

export function sessionScheduledCopy(opts: {
  tutorName: string;
  when: string;
  topic: string | null;
}): NotificationCopy {
  return {
    title: `Session scheduled with ${opts.tutorName}`,
    body: `${opts.when}${opts.topic ? ` · ${opts.topic}` : ""}`,
    link: "/timetable",
  };
}

export function sessionCancelledCopy(opts: {
  cancelledByName: string;
  when: string;
  topic: string | null;
}): NotificationCopy {
  return {
    title: `Session cancelled by ${opts.cancelledByName}`,
    body: `${opts.when}${opts.topic ? ` · ${opts.topic}` : ""}`,
    link: "/timetable",
  };
}

export function groupAddedCopy(opts: {
  tutorName: string;
  groupName: string;
  groupId: string;
}): NotificationCopy {
  return {
    title: `${opts.tutorName} added you to ${opts.groupName}`,
    body: null,
    link: `/groups?g=${opts.groupId}`,
  };
}

export function tutorReviewedCopy(opts: {
  approved: boolean;
  note: string | null;
}): NotificationCopy {
  return opts.approved
    ? {
        title: "Your tutor profile is approved",
        body: opts.note
          ? clip(opts.note, 300)
          : "You're now listed in the tutor directory. Students can book you.",
        link: "/tutor",
      }
    : {
        title: "Your tutor application needs changes",
        body: opts.note ? clip(opts.note, 300) : null,
        link: "/tutor/settings",
      };
}

/** "3h ago" style relative time for the bell list. */
export function relativeTime(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Accra",
  });
}

/** True when a reminder sent at `lastIso` is too recent to send another. */
export function reminderCoolingDown(lastIso: string | null, now: number, hours = 24): boolean {
  if (!lastIso) return false;
  return now - Date.parse(lastIso) < hours * 3_600_000;
}
