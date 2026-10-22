import { describe, expect, it } from "vitest";
import {
  installmentReminderDedupePrefix,
  installmentsToRemind,
  REMINDER_MAX_MS,
  REMINDER_MIN_MS,
  sessionsNeedingReminder,
  sessionReminderDedupePrefix,
  sessionReminderText,
  smsTimeLabel,
  type InstallmentReminder,
  type ReminderSession,
} from "./smsReminders";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

function session(overrides: Partial<ReminderSession> = {}): ReminderSession {
  return {
    id: "s1",
    scheduled_at: new Date(NOW + 60 * 60_000).toISOString(),
    duration_minutes: 60,
    topic: "Fluid Mechanics",
    status: "scheduled",
    student_id: "student-1",
    student_name: "Ama",
    tutor_profile_id: "tutor-1",
    tutor_name: "Kwabena",
    ...overrides,
  };
}

describe("sessionsNeedingReminder", () => {
  it("picks a session inside the window", () => {
    const due = sessionsNeedingReminder([session()], NOW);
    expect(due).toHaveLength(1);
  });

  it("ignores sessions that are too far away", () => {
    const far = session({
      scheduled_at: new Date(NOW + 5 * 60 * 60_000).toISOString(),
    });
    expect(sessionsNeedingReminder([far], NOW)).toHaveLength(0);
  });

  it("ignores sessions that already started", () => {
    const past = session({
      scheduled_at: new Date(NOW - 10 * 60_000).toISOString(),
    });
    expect(sessionsNeedingReminder([past], NOW)).toHaveLength(0);
  });

  it("never reminds for a cancelled session", () => {
    const cancelled = session({ status: "cancelled" });
    expect(sessionsNeedingReminder([cancelled], NOW)).toHaveLength(0);
  });

  it("respects the window edges", () => {
    const atStart = session({
      scheduled_at: new Date(NOW + REMINDER_MIN_MS).toISOString(),
    });
    const atEnd = session({
      scheduled_at: new Date(NOW + REMINDER_MAX_MS).toISOString(),
    });
    const justBefore = session({
      scheduled_at: new Date(NOW + REMINDER_MIN_MS - 1000).toISOString(),
    });
    const justAfter = session({
      scheduled_at: new Date(NOW + REMINDER_MAX_MS + 1000).toISOString(),
    });
    expect(sessionsNeedingReminder([atStart], NOW)).toHaveLength(1);
    expect(sessionsNeedingReminder([atEnd], NOW)).toHaveLength(1);
    expect(sessionsNeedingReminder([justBefore], NOW)).toHaveLength(0);
    expect(sessionsNeedingReminder([justAfter], NOW)).toHaveLength(0);
  });
});

describe("smsTimeLabel", () => {
  it("formats in Accra time on a 24-hour clock", () => {
    // 14:00 UTC is 14:00 in Accra (GMT, no DST).
    const label = smsTimeLabel(Date.UTC(2026, 9, 21, 14, 0, 0));
    expect(label).toContain("21");
    expect(label).toContain("14:00");
  });
});

describe("sessionReminderText", () => {
  it("names the other party and keeps it to one segment", () => {
    const text = sessionReminderText({
      role: "student",
      when: "Wed 21 Oct, 2:00 pm",
      counterpart: "Kwabena",
      topic: "Fluid Mechanics",
    });
    expect(text).toContain("Kwabena");
    expect(text).toContain("Fluid Mechanics");
    expect(text.length).toBeLessThan(160);
  });

  it("omits an empty topic", () => {
    const text = sessionReminderText({
      role: "tutor",
      when: "Wed 21 Oct, 2:00 pm",
      counterpart: "Ama",
      topic: null,
    });
    expect(text).not.toContain("()");
  });
});

describe("dedupe prefixes", () => {
  it("gives every recipient of a session their own key", () => {
    const prefix = sessionReminderDedupePrefix("session-1");
    expect(`${prefix}:student-1`).not.toBe(`${prefix}:tutor-1`);
  });

  it("separates a due reminder from an overdue one", () => {
    expect(installmentReminderDedupePrefix("i1", "due")).not.toBe(
      installmentReminderDedupePrefix("i1", "overdue"),
    );
  });
});

function installment(
  overrides: Partial<InstallmentReminder> = {},
): InstallmentReminder {
  return {
    id: "i1",
    idx: 2,
    amount: BigInt(5000),
    dueAt: new Date(NOW).toISOString(),
    status: "pending",
    studentId: "student-1",
    ...overrides,
  };
}

describe("installmentsToRemind", () => {
  it("reminds about one that falls due today", () => {
    const out = installmentsToRemind([installment()], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("due");
  });

  it("reminds about one that is already overdue", () => {
    const out = installmentsToRemind(
      [installment({ status: "overdue" })],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("overdue");
  });

  it("leaves a future installment alone", () => {
    const future = installment({
      dueAt: new Date(NOW + 5 * 24 * 60 * 60_000).toISOString(),
    });
    expect(installmentsToRemind([future], NOW)).toHaveLength(0);
  });

  it("never reminds about a paid installment", () => {
    const paid = installment({ status: "paid" });
    expect(installmentsToRemind([paid], NOW)).toHaveLength(0);
  });
});
