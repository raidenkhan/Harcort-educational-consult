import { afterEach, describe, expect, it } from "vitest";
import {
  attendanceConfirmedEmail,
  escapeHtml,
  groupJoinedEmail,
  newMessageEmail,
  passwordResetEmail,
  paymentReceivedEmail,
  sessionCancelledEmail,
  sessionScheduledEmail,
  tutorApplicationEmail,
  tutorRequestEmail,
  tutorReviewEmail,
} from "./templates";

describe("email templates", () => {
  it("newMessageEmail includes the sender, preview and chat link", () => {
    const msg = newMessageEmail({
      senderName: "Kwame",
      preview: "Can we meet on Monday?",
      chatUrl: "https://app.example.com/chat?c=abc",
    });
    expect(msg.subject).toContain("Kwame");
    expect(msg.text).toContain("Can we meet on Monday?");
    expect(msg.text).toContain("/chat?c=abc");
    expect(msg.html).toContain("Harcourt Educational Consult");
  });

  it("newMessageEmail truncates long previews", () => {
    const long = "x".repeat(300);
    const msg = newMessageEmail({
      senderName: "A",
      preview: long,
      chatUrl: "https://app.example.com/chat?c=abc",
    });
    expect(msg.text).not.toContain("x".repeat(300));
  });

  it("sessionScheduledEmail includes who, when, topic, location and calendar", () => {
    const msg = sessionScheduledEmail({
      tutorName: "Ama",
      studentName: "Kojo",
      when: "Mon 14 Aug · 14:00–15:00",
      topic: "Mechanics",
      location: "KNUST Library",
      title: "Tutoring with Ama — Mechanics",
      start: new Date("2026-08-14T14:00:00Z"),
      end: new Date("2026-08-14T15:00:00Z"),
      now: new Date("2026-08-13T10:00:00Z"),
      uid: "test@harcourtinstitute.com",
      dashboardUrl: "https://app.example.com/dashboard",
    });
    expect(msg.subject).toContain("Mechanics");
    expect(msg.text).toContain("Ama");
    expect(msg.text).toContain("Kojo");
    expect(msg.text).toContain("KNUST Library");
    // The calendar link is the whole point: present in text and as a button.
    expect(msg.text).toContain("calendar.google.com");
    expect(msg.html).toContain("Add to Google Calendar");
    // And an .ics attachment covers Apple/Outlook.
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].filename).toBe("session.ics");
    expect(msg.attachments![0].contentType).toContain("text/calendar");
    const ics = Buffer.from(msg.attachments![0].content, "base64").toString("utf-8");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("SUMMARY:Tutoring with Ama — Mechanics");
    expect(ics).toContain("DTSTART:20260814T140000Z");
    expect(ics).toContain("LOCATION:KNUST Library");
  });

  it("sessionCancelledEmail names the canceller", () => {
    const msg = sessionCancelledEmail({
      cancelledByName: "Ama",
      when: "Mon 14 Aug · 14:00–15:00",
      topic: "Mechanics",
      dashboardUrl: "https://app.example.com/dashboard",
    });
    expect(msg.subject).toContain("cancelled");
    expect(msg.text).toContain("Ama");
  });

  it("attendanceConfirmedEmail shows both tick states for admins", () => {
    const msg = attendanceConfirmedEmail({
      tutorName: "Ama",
      studentName: "Kojo",
      when: "Mon 14 Aug · 14:00–15:00",
      topic: "Mechanics",
      confirmedBy: "Ama",
      tutorTick: true,
      studentTick: false,
      adminUrl: "https://app.example.com/admin",
    });
    expect(msg.text).toContain("Tutor ✓");
    expect(msg.text).not.toContain("Student ✓");
    expect(msg.text).toContain("/admin");
  });

  it("tutorApplicationEmail points admins at the review page", () => {
    const msg = tutorApplicationEmail({
      tutorName: "Efua",
      adminUrl: "https://app.example.com/admin",
    });
    expect(msg.subject).toContain("Efua");
    expect(msg.text).toContain("/admin");
  });

  it("tutorReviewEmail differs for approved vs rejected", () => {
    const approved = tutorReviewEmail({
      approved: true,
      note: "Great credentials!",
      tutorUrl: "https://app.example.com/tutor",
    });
    const rejected = tutorReviewEmail({
      approved: false,
      note: "Missing qualification document",
      tutorUrl: "https://app.example.com/tutor",
    });
    expect(approved.subject).toContain("approved");
    expect(approved.text).toContain("Great credentials!");
    expect(rejected.subject).toContain("not approved");
    expect(rejected.text).toContain("Missing qualification document");
  });

  it("passwordResetEmail surfaces the code clearly", () => {
    const msg = passwordResetEmail({
      code: "12345678",
      resetUrl: "https://app.example.com/forgot-password",
    });
    expect(msg.text).toContain("12345678");
    expect(msg.text).toContain("30 minutes");
    expect(msg.html).toContain("12345678");
  });
});

describe("email HTML escaping", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes markup smuggled through a display name and message body", () => {
    const msg = newMessageEmail({
      senderName: '<img src=x onerror="alert(1)">',
      preview: "hello <script>alert(1)</script>",
      chatUrl: "https://app.example.com/chat?c=abc",
    });
    expect(msg.html).not.toContain("<img");
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;img");
    expect(msg.html).toContain("&lt;script&gt;");
  });

  it("escapes an admin note and a session topic", () => {
    const review = tutorReviewEmail({
      approved: false,
      note: '<b onclick="x">no</b>',
      tutorUrl: "https://app.example.com/tutor",
    });
    expect(review.html).not.toContain("<b onclick");
    expect(review.html).toContain("&lt;b onclick");

    const scheduled = sessionScheduledEmail({
      tutorName: "Ama",
      studentName: "Kojo",
      when: "Mon 14 Aug · 14:00–15:00",
      topic: "<script>steal()</script>",
      location: null,
      title: "Tutoring with Ama — <script>steal()</script>",
      start: new Date("2026-08-14T14:00:00Z"),
      end: new Date("2026-08-14T15:00:00Z"),
      now: new Date("2026-08-13T10:00:00Z"),
      uid: "test@harcourtinstitute.com",
      dashboardUrl: "https://app.example.com/dashboard",
    });
    expect(scheduled.html).not.toContain("<script>");
  });

  it("drops non-http(s) action links", () => {
    const msg = tutorApplicationEmail({
      tutorName: "A",
      adminUrl: "javascript:alert(1)",
    });
    expect(msg.html).not.toContain("javascript:");
    expect(msg.html).toContain('href="#"');
  });
});

describe("tutorRequestEmail", () => {
  const prev = process.env.APP_URL;

  afterEach(() => {
    if (prev === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prev;
  });

  it("received sends the tutor to their dashboard and names the asker", () => {
    process.env.APP_URL = "https://app.example.com";
    const msg = tutorRequestEmail({
      kind: "received",
      studentName: "Kojo",
      tutorName: "Ama",
      courseTitle: "ME 255 Thermodynamics",
    });
    expect(msg.subject).toContain("Kojo");
    expect(msg.text).toContain("Kojo");
    expect(msg.html).toContain("ME 255 Thermodynamics");
    expect(msg.html).toContain("https://app.example.com/tutor");
  });

  it("accepted sends the student to their dashboard, declined to the directory", () => {
    process.env.APP_URL = "https://app.example.com";
    const accepted = tutorRequestEmail({ kind: "accepted", tutorName: "Ama" });
    const declined = tutorRequestEmail({ kind: "declined", tutorName: "Ama" });
    expect(accepted.html).toContain("https://app.example.com/dashboard");
    expect(declined.html).toContain("https://app.example.com/tutors");
    expect(declined.subject).toContain("declined");
  });

  it("escapes attacker-controllable names and course titles", () => {
    const msg = tutorRequestEmail({
      kind: "received",
      studentName: '<img src=x onerror="alert(1)">',
      courseTitle: "<script>alert(2)</script>",
    });
    expect(msg.html).not.toContain("<img src=x");
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).toContain("&lt;img");
  });

  it("still builds when the request could not be resolved", () => {
    const msg = tutorRequestEmail({ kind: "received" });
    expect(msg.subject).toBeTruthy();
    expect(msg.text).toContain("A student");
  });
});

describe("paymentReceivedEmail invoice", () => {
  const base = {
    audience: "student" as const,
    amountDisplay: "GH₵60.00",
    studentName: "Kojo",
    courseTitle: "ME 255 Thermodynamics",
    tutorName: "Ama",
    confirmed: true,
  };

  it("itemises the fee, the total and the reference for the student", () => {
    const msg = paymentReceivedEmail({
      ...base,
      reference: "HARC-abc-123",
      feeDisplay: "GH₵1.17",
      totalDisplay: "GH₵61.17",
    });
    expect(msg.subject).toContain("Receipt");
    expect(msg.html).toContain("Paystack processing fee");
    expect(msg.html).toContain("GH₵61.17");
    expect(msg.html).toContain("HARC-abc-123");
    expect(msg.text).toContain("Payment reference: HARC-abc-123");
  });

  it("still sends for a legacy row that has no reference or fee", () => {
    const msg = paymentReceivedEmail(base);
    expect(msg.subject).toBeTruthy();
    expect(msg.html).not.toContain("Payment reference");
    expect(msg.html).not.toContain("Paystack processing fee");
  });

  it("tutors get the notification copy, not the receipt", () => {
    const msg = paymentReceivedEmail({
      ...base,
      audience: "tutor",
      reference: "HARC-abc-123",
      feeDisplay: "GH₵1.17",
      totalDisplay: "GH₵61.17",
    });
    expect(msg.subject).not.toContain("Receipt");
    expect(msg.html).toContain("nothing to approve");
  });
});

describe("groupJoinedEmail", () => {
  const before = process.env.APP_URL;

  afterEach(() => {
    if (before === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = before;
  });

  it("names the student, group and course and links to the group", () => {
    process.env.APP_URL = "https://app.example.com";
    const msg = groupJoinedEmail({
      studentName: "Kojo",
      groupName: "Thermodynamics Crew",
      courseName: "ME 255",
      groupId: "abc-123",
    });
    expect(msg.subject).toContain("Kojo");
    expect(msg.text).toContain("ME 255");
    expect(msg.html).toContain("https://app.example.com/groups?g=abc-123");
  });

  it("escapes the student and group names", () => {
    const msg = groupJoinedEmail({
      studentName: "<script>alert(1)</script>",
      groupName: '"><img src=x onerror=alert(1)>',
      groupId: "abc",
    });
    expect(msg.html).not.toContain("<script>");
    expect(msg.html).not.toContain("<img src=x");
  });
});
