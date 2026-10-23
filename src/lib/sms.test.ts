import { describe, expect, it, afterEach } from "vitest";
import {
  extractSmsId,
  isSmsConfigured,
  normalizeGhPhone,
  reminderDedupeKey,
  smsApiKey,
  smsProvider,
} from "./sms";

describe("normalizeGhPhone", () => {
  it("converts the local 0-prefixed form to international digits", () => {
    expect(normalizeGhPhone("0241234567")).toBe("233241234567");
  });

  it("accepts an already-international number", () => {
    expect(normalizeGhPhone("233241234567")).toBe("233241234567");
  });

  it("strips formatting from a +233 number", () => {
    expect(normalizeGhPhone("+233 24 123 4567")).toBe("233241234567");
    expect(normalizeGhPhone("+233241234567")).toBe("233241234567");
  });

  it("rejects junk, blanks and wrong-length numbers", () => {
    expect(normalizeGhPhone(null)).toBeNull();
    expect(normalizeGhPhone(undefined)).toBeNull();
    expect(normalizeGhPhone("")).toBeNull();
    expect(normalizeGhPhone("not-a-phone")).toBeNull();
    expect(normalizeGhPhone("024123456")).toBeNull();
    expect(normalizeGhPhone("02412345678")).toBeNull();
    expect(normalizeGhPhone("12345")).toBeNull();
  });
});

describe("extractSmsId", () => {
  it("reads the id out of the documented list shape", () => {
    const { smsId, rejected } = extractSmsId([
      { recipient: "233241234567", id: "msg_abc" },
    ]);
    expect(smsId).toBe("msg_abc");
    expect(rejected).toEqual([]);
  });

  it("reads the id out of the single-object shape", () => {
    const { smsId } = extractSmsId({ id: "msg_xyz", credits_used: 1 });
    expect(smsId).toBe("msg_xyz");
  });

  it("reports a recipient that came back without an id", () => {
    const { smsId, rejected } = extractSmsId([
      { recipient: "233241234567" },
    ]);
    expect(smsId).toBeUndefined();
    expect(rejected).toEqual(["233241234567"]);
  });

  it("survives a missing payload", () => {
    expect(extractSmsId(undefined)).toEqual({ rejected: [] });
  });
});

describe("reminderDedupeKey", () => {
  it("gives each recipient of one event their own key", () => {
    expect(reminderDedupeKey("session:abc:reminder", "student")).toBe(
      "session:abc:reminder:student",
    );
    expect(reminderDedupeKey("session:abc:reminder", "tutor")).not.toBe(
      reminderDedupeKey("session:abc:reminder", "student"),
    );
  });
});

describe("smsProvider", () => {
  const original = process.env.SMS_PROVIDER;

  afterEach(() => {
    if (original === undefined) delete process.env.SMS_PROVIDER;
    else process.env.SMS_PROVIDER = original;
  });

  it("defaults to arkesel when unset", () => {
    delete process.env.SMS_PROVIDER;
    expect(smsProvider()).toBe("arkesel");
  });

  it("reads the provider from the env", () => {
    process.env.SMS_PROVIDER = "mnotify";
    expect(smsProvider()).toBe("mnotify");
    process.env.SMS_PROVIDER = "HUBTEL";
    expect(smsProvider()).toBe("hubtel");
  });

  it("falls back to arkesel on an unknown provider", () => {
    process.env.SMS_PROVIDER = "twilio";
    expect(smsProvider()).toBe("arkesel");
  });
});

describe("smsApiKey", () => {
  const originalSms = process.env.SMS_API_KEY;
  const originalArkesel = process.env.ARKESEL_API_KEY;

  afterEach(() => {
    if (originalSms === undefined) delete process.env.SMS_API_KEY;
    else process.env.SMS_API_KEY = originalSms;
    if (originalArkesel === undefined) delete process.env.ARKESEL_API_KEY;
    else process.env.ARKESEL_API_KEY = originalArkesel;
  });

  it("trims a pasted key", () => {
    process.env.SMS_API_KEY = "  abc123\r\n";
    expect(smsApiKey()).toBe("abc123");
  });

  it("strips quotes the user typed around it", () => {
    process.env.SMS_API_KEY = '"abc123"';
    expect(smsApiKey()).toBe("abc123");
  });

  it("strips single quotes and stray whitespace together", () => {
    process.env.SMS_API_KEY = " 'abc123' ";
    expect(smsApiKey()).toBe("abc123");
  });

  it("keeps a clean key untouched", () => {
    process.env.SMS_API_KEY = "abc123";
    expect(smsApiKey()).toBe("abc123");
  });

  it("treats an empty or whitespace-only value as unset", () => {
    process.env.SMS_API_KEY = "   ";
    expect(smsApiKey()).toBe("");
    expect(isSmsConfigured()).toBe(false);
  });

  it("falls back to the legacy ARKESEL_API_KEY", () => {
    delete process.env.SMS_API_KEY;
    process.env.ARKESEL_API_KEY = "legacy-key";
    expect(smsApiKey()).toBe("legacy-key");
  });

  it("prefers the neutral name when both are set", () => {
    process.env.SMS_API_KEY = "new-key";
    process.env.ARKESEL_API_KEY = "legacy-key";
    expect(smsApiKey()).toBe("new-key");
  });

  it("reports not-configured for a provider that isn't wired up", () => {
    process.env.SMS_API_KEY = "abc123";
    process.env.SMS_PROVIDER = "mnotify"; // no adapter registered yet
    expect(isSmsConfigured()).toBe(false);
  });
});
