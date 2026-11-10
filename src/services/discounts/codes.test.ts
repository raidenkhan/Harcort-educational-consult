import { describe, expect, it } from "vitest";
import {
  checkDiscountEligibility,
  discountOn,
  discountReasonMessage,
  generateDiscountCode,
  isValidDiscountCode,
  namePart,
  normalizeDiscountCode,
  programmeInitials,
} from "./codes";

describe("code parts", () => {
  it("takes programme initials, skipping filler words", () => {
    expect(programmeInitials("Mechanical Engineering")).toBe("ME");
    expect(programmeInitials("Electrical & Electronic Engineering")).toBe("EEE");
    expect(programmeInitials("Science of Materials")).toBe("SM");
    expect(programmeInitials("Aerospace")).toBe("AER");
    expect(programmeInitials(null)).toBe("GEN");
  });

  it("takes up to four letters of the first name", () => {
    expect(namePart("Ama Mensah")).toBe("AMA");
    expect(namePart("Benjamin Cameron")).toBe("BENJ");
    expect(namePart("")).toBe("STU");
  });
});

describe("generateDiscountCode", () => {
  it("builds NAME-PROGYEAR-RANDOM with an unambiguous random block", () => {
    let call = 0;
    const bytes = (n: number) => Uint8Array.from({ length: n }, () => (call++ * 37) % 248);
    const code = generateDiscountCode({ name: "Ama Mensah", programme: "Mechanical Engineering", year: 2 }, bytes);
    expect(code).toMatch(/^AMA-ME2-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(isValidDiscountCode(code)).toBe(true);
  });

  it("skips biased bytes (≥248) instead of skewing the alphabet", () => {
    const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 255 : 0));
    const code = generateDiscountCode({ name: "Kofi", programme: "Computer Science", year: 3 }, bytes);
    expect(code).toBe("KOFI-CS3-222222");
  });

  it("uses the current year when the student has none", () => {
    const code = generateDiscountCode({ name: "Esi", programme: "Marine Engineering", year: null });
    expect(code).toMatch(new RegExp(`^ESI-ME${new Date().getUTCFullYear() % 100}-`));
  });

  it("produces different codes on each call", () => {
    const a = generateDiscountCode({ name: "Ama", programme: "X Y", year: 1 });
    const b = generateDiscountCode({ name: "Ama", programme: "X Y", year: 1 });
    expect(a).not.toBe(b);
  });
});

describe("normalize / validate", () => {
  it("upper-cases and strips spaces", () => {
    expect(normalizeDiscountCode(" ama-me2-k7qx9p ")).toBe("AMA-ME2-K7QX9P");
    expect(normalizeDiscountCode(null)).toBe("");
    expect(isValidDiscountCode("AB")).toBe(false);
    expect(isValidDiscountCode("HELLO WORLD")).toBe(false);
  });
});

describe("discountOn", () => {
  it("rounds to the nearest pesewa and caps at 100%", () => {
    expect(discountOn(BigInt(90_000), 10)).toBe(BigInt(9_000));
    expect(discountOn(BigInt(333), 50)).toBe(BigInt(167));
    expect(discountOn(BigInt(1_000), 150)).toBe(BigInt(1_000));
    expect(discountOn(BigInt(1_000), 0)).toBe(BigInt(0));
  });
});

describe("checkDiscountEligibility", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const row = { student_id: "s1", status: "active", percent: 20, expires_at: null as string | null };

  it("accepts the owner's active, unexpired code", () => {
    expect(checkDiscountEligibility(row, "s1", now)).toEqual({ ok: true, percent: 20 });
  });

  it("refuses other students, used, revoked and expired codes", () => {
    expect(checkDiscountEligibility(row, "s2", now)).toEqual({ ok: false, reason: "not_yours" });
    expect(checkDiscountEligibility({ ...row, status: "used" }, "s1", now)).toEqual({ ok: false, reason: "used" });
    expect(checkDiscountEligibility(row, "s1", now, true)).toEqual({ ok: false, reason: "used" });
    expect(checkDiscountEligibility({ ...row, status: "revoked" }, "s1", now)).toEqual({ ok: false, reason: "revoked" });
    expect(checkDiscountEligibility({ ...row, expires_at: "2026-11-01T00:00:00Z" }, "s1", now)).toEqual({ ok: false, reason: "expired" });
    expect(checkDiscountEligibility(null, "s1", now)).toEqual({ ok: false, reason: "not_found" });
  });

  it("never reveals that someone else's code exists", () => {
    expect(discountReasonMessage("not_yours")).toBe(discountReasonMessage("not_found"));
  });
});
