import { describe, expect, it } from "vitest";
import { extractSmsId, normalizeGhPhone, reminderDedupeKey } from "./sms";

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
