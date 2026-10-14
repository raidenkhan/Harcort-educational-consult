import { describe, expect, it } from "vitest";
import { normalizeGhPhone } from "./sms";

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
