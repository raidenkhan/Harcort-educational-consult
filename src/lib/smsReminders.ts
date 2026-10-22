/**
 * Session-reminder helpers — pure, so the window logic is unit-testable and
 * no component ever has to call Date.now() (React Compiler purity rule).
 *
 * The window is deliberately wide (45–90 minutes before the start). The
 * reminder job runs on a 15-minute schedule, and GitHub's scheduler drifts —
 * a narrow window would let sessions fall through the gap.
 */

/** Earliest a reminder may fire, relative to the session start. */
export const REMINDER_MIN_MS = 45 * 60_000;

/** Latest a reminder may fire, relative to the session start. */
export const REMINDER_MAX_MS = 90 * 60_000;

export interface ReminderSession {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  topic: string | null;
  status: string;
  student_id: string;
  student_name: string;
  /** The tutor's profile id (not the tutor_profiles row id). */
  tutor_profile_id: string;
  tutor_name: string;
}

/**
 * Sessions that are due a reminder right now: still scheduled, and starting
 * inside the window. Cancelled sessions never remind anybody.
 */
export function sessionsNeedingReminder(
  sessions: ReminderSession[],
  now: number,
  minMs = REMINDER_MIN_MS,
  maxMs = REMINDER_MAX_MS,
): ReminderSession[] {
  return sessions.filter((session) => {
    if (session.status !== "scheduled") return false;
    const start = new Date(session.scheduled_at).getTime();
    if (Number.isNaN(start)) return false;
    const untilStart = start - now;
    return untilStart >= minMs && untilStart <= maxMs;
  });
}

const ACCRA_TIME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Accra",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "Wed 21 Oct, 2:00 pm" in Accra time — one SMS segment. */
export function smsTimeLabel(ts: number): string {
  return ACCRA_TIME.format(new Date(ts));
}

/**
 * The text of a session reminder. One segment, both parties, different
 * wording: the student is being reminded of their commitment, the tutor of
 * theirs.
 */
export function sessionReminderText(opts: {
  role: "student" | "tutor";
  when: string;
  counterpart: string;
  topic: string | null;
}): string {
  const topic = opts.topic ? ` (${opts.topic})` : "";
  return `Harcourt: your session with ${opts.counterpart} is at ${opts.when}${topic}. Open the app to reschedule or cancel.`;
}

/** The dedupe prefix a reminder claims — one key per (session, recipient). */
export function sessionReminderDedupePrefix(sessionId: string): string {
  return `session:${sessionId}:reminder`;
}

// ---------------------------------------------------------------------------
// Installment (payment) reminders
// ---------------------------------------------------------------------------

export interface InstallmentReminder {
  id: string;
  idx: number;
  /** In pesewas. */
  amount: bigint;
  dueAt: string;
  status: string;
  studentId: string;
}

/** Start of tomorrow in Accra (= UTC) — the end of "today" for the sweep. */
function endOfToday(now: number): number {
  const day = new Date(now);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
}

/**
 * The installments a student should hear about today: one that falls due
 * today, and one that has already gone overdue. Each is a distinct kind, so
 * the dedupe key lets a student get BOTH texts (due today, then overdue) but
 * never the same one twice.
 */
export function installmentsToRemind(
  installments: InstallmentReminder[],
  now: number,
): { kind: "due" | "overdue"; installment: InstallmentReminder }[] {
  const cutoff = endOfToday(now);
  const out: { kind: "due" | "overdue"; installment: InstallmentReminder }[] = [];

  for (const installment of installments) {
    if (installment.status === "overdue") {
      out.push({ kind: "overdue", installment });
      continue;
    }
    if (installment.status !== "pending") continue;
    const due = new Date(installment.dueAt).getTime();
    if (Number.isNaN(due)) continue;
    if (due <= cutoff) out.push({ kind: "due", installment });
  }

  return out;
}

/** The dedupe prefix for an installment reminder. */
export function installmentReminderDedupePrefix(
  installmentId: string,
  kind: "due" | "overdue",
): string {
  return `installment:${installmentId}:${kind}`;
}
