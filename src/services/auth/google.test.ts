import { describe, expect, it } from "vitest";
import { normalizeGoogleRole } from "./google";

describe("normalizeGoogleRole", () => {
  it("accepts an explicit tutor choice", () => {
    expect(normalizeGoogleRole("tutor")).toBe("tutor");
  });

  it("defaults everything else to student", () => {
    expect(normalizeGoogleRole(null)).toBe("student");
    expect(normalizeGoogleRole(undefined)).toBe("student");
    expect(normalizeGoogleRole("")).toBe("student");
    expect(normalizeGoogleRole("student")).toBe("student");
  });

  it("never lets an untrusted value escalate to admin", () => {
    expect(normalizeGoogleRole("admin")).toBe("student");
    expect(normalizeGoogleRole("ADMIN")).toBe("student");
    expect(normalizeGoogleRole("tutor ")).toBe("student"); // whitespace isn't trusted
  });
});
