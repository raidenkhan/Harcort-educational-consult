import { describe, expect, it } from "vitest";
import {
  attendanceConfirmedEmail,
  newMessageEmail,
  passwordResetEmail,
  sessionCancelledEmail,
  sessionScheduledEmail,
  tutorApplicationEmail,
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

  it("sessionScheduledEmail includes who, when, topic and location", () => {
    const msg = sessionScheduledEmail({
      tutorName: "Ama",
      studentName: "Kojo",
      when: "Mon 14 Aug · 14:00–15:00",
      topic: "Mechanics",
      location: "KNUST Library",
      dashboardUrl: "https://app.example.com/dashboard",
    });
    expect(msg.subject).toContain("Mechanics");
    expect(msg.text).toContain("Ama");
    expect(msg.text).toContain("Kojo");
    expect(msg.text).toContain("KNUST Library");
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
