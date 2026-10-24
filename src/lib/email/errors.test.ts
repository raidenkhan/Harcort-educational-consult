import { describe, expect, it } from "vitest";
import { emailErrorReason } from "./errors";

/**
 * The mapper exists because Resend's own message names the account owner's
 * address. These tests pin the two things that matter: no address ever comes
 * out, and each failure class gets a distinct, actionable sentence.
 */

describe("emailErrorReason", () => {
  it("hides the account owner's address in Resend's testing-mode rejection", () => {
    const reason = emailErrorReason({
      name: "validation_error",
      message:
        "You can only send testing emails to your own email address (owner@example.com). To send emails to other recipients, please verify a domain at resend.com/domains, and change the `from` address to an email using this domain.",
    });

    expect(reason).not.toContain("owner@example.com");
    expect(reason).not.toContain("@");
    expect(reason).toMatch(/domain isn't verified/i);
  });

  it("does not confuse an unrelated validation error with the testing-mode one", () => {
    const reason = emailErrorReason({
      name: "validation_error",
      message: "Invalid `to` field.",
    });

    expect(reason).not.toMatch(/domain isn't verified/i);
    expect(reason).toMatch(/couldn't send/i);
  });

  it("names key problems as a server-side outage, not something to retry", () => {
    for (const name of [
      "missing_api_key",
      "invalid_api_key",
      "restricted_api_key",
    ]) {
      expect(emailErrorReason({ name, message: "nope" })).toMatch(
        /temporarily unavailable/i,
      );
    }
  });

  it("asks the user to try later when a quota ceiling is hit", () => {
    for (const name of [
      "daily_quota_exceeded",
      "monthly_quota_exceeded",
      "rate_limit_exceeded",
    ]) {
      const reason = emailErrorReason({ name, message: "quota" });
      expect(reason).toMatch(/try again shortly/i);
      expect(reason).not.toMatch(/unavailable/i);
    }
  });

  it("falls back to a generic message for anything unrecognised", () => {
    expect(emailErrorReason(null)).toBe(
      "We couldn't send that email. Please try again.",
    );
    expect(emailErrorReason({})).toBe(
      "We couldn't send that email. Please try again.",
    );
    expect(emailErrorReason({ name: "application_error" })).toBe(
      "We couldn't send that email. Please try again.",
    );
  });
});
