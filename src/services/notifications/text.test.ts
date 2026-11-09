import { describe, expect, it } from "vitest";
import {
  newMessageCopy,
  outboxNotificationCopy,
  paymentReminderCopy,
  relativeTime,
  reminderCoolingDown,
  tutorReviewedCopy,
} from "./text";

describe("paymentReminderCopy", () => {
  it("nudges a student with nothing picked towards courses", () => {
    const copy = paymentReminderCopy("Ama", []);
    expect(copy.title).toBe("Pick a course to get started");
    expect(copy.body).toContain("Hi Ama,");
    expect(copy.link).toBe("/courses");
  });

  it("names the waiting course and tutor and sends them to pay", () => {
    const copy = paymentReminderCopy("Ama", [
      { courseTitle: "ME 261", tutorName: "Kofi" },
    ]);
    expect(copy.title).toMatch(/Complete your payment/);
    expect(copy.body).toContain("ME 261 with Kofi");
    expect(copy.link).toBe("/dashboard/payments");
  });

  it("summarises several selections", () => {
    const copy = paymentReminderCopy("", [
      { courseTitle: "ME 261", tutorName: "Kofi" },
      { courseTitle: "ME 255", tutorName: "Esi" },
    ]);
    expect(copy.body).toContain("ME 261 with Kofi and 1 more");
    expect(copy.body?.startsWith("Hi")).toBe(false);
  });
});

describe("outboxNotificationCopy", () => {
  it("never notifies the admin audience in-app", () => {
    expect(
      outboxNotificationCopy({ type: "payment.received", audience: "admin", subject: "x" }),
    ).toBeNull();
  });

  it("links each side to its own page", () => {
    expect(
      outboxNotificationCopy({ type: "payment.received", audience: "student", subject: "Receipt" })?.link,
    ).toBe("/dashboard/payments");
    expect(
      outboxNotificationCopy({ type: "payment.received", audience: "tutor", subject: "Paid" })?.link,
    ).toBe("/tutor/earnings");
  });

  it("ignores types it has no page for", () => {
    expect(
      outboxNotificationCopy({ type: "something.new", audience: "student", subject: "x" }),
    ).toBeNull();
  });
});

describe("newMessageCopy", () => {
  it("clips long previews and collapses whitespace", () => {
    const copy = newMessageCopy({
      senderName: "Kofi",
      body: `hello\n\n${"a".repeat(300)}`,
      conversationId: "c1",
    });
    expect(copy.title).toBe("New message from Kofi");
    expect(copy.body?.length).toBeLessThanOrEqual(140);
    expect(copy.body?.startsWith("hello a")).toBe(true);
    expect(copy.link).toBe("/chat?c=c1");
  });
});

describe("tutorReviewedCopy", () => {
  it("words approval and rejection differently", () => {
    expect(tutorReviewedCopy({ approved: true, note: null }).link).toBe("/tutor");
    expect(tutorReviewedCopy({ approved: false, note: "Add a bio" }).body).toBe("Add a bio");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("reads like a feed", () => {
    expect(relativeTime("2026-11-09T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-11-09T11:30:00Z", now)).toBe("30m ago");
    expect(relativeTime("2026-11-09T09:00:00Z", now)).toBe("3h ago");
    expect(relativeTime("2026-11-07T12:00:00Z", now)).toBe("2d ago");
    expect(relativeTime("2026-10-01T12:00:00Z", now)).toBe("1 Oct");
  });
});

describe("reminderCoolingDown", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  it("blocks a second reminder within 24 hours", () => {
    expect(reminderCoolingDown(null, now)).toBe(false);
    expect(reminderCoolingDown("2026-11-09T01:00:00Z", now)).toBe(true);
    expect(reminderCoolingDown("2026-11-08T11:00:00Z", now)).toBe(false);
  });
});
