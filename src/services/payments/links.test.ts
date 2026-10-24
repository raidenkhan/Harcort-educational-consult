import { describe, expect, it } from "vitest";
import {
  generatePaymentToken,
  hashPaymentToken,
  isPlausiblePaymentToken,
  paymentLinkPath,
} from "./links";

describe("generatePaymentToken", () => {
  it("is URL-safe and long enough to be unguessable", () => {
    const token = generatePaymentToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 200 }, generatePaymentToken));
    expect(tokens.size).toBe(200);
  });
});

describe("hashPaymentToken", () => {
  it("is stable for the same token", () => {
    const token = "abc123";
    expect(hashPaymentToken(token)).toBe(hashPaymentToken(token));
  });

  it("produces a 64-char hex SHA-256 digest", () => {
    expect(hashPaymentToken("abc123")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for different tokens", () => {
    expect(hashPaymentToken("one")).not.toBe(hashPaymentToken("two"));
  });
});

describe("isPlausiblePaymentToken", () => {
  it("accepts a generated token", () => {
    expect(isPlausiblePaymentToken(generatePaymentToken())).toBe(true);
  });

  it("rejects junk before it reaches the database", () => {
    expect(isPlausiblePaymentToken("")).toBe(false);
    expect(isPlausiblePaymentToken("short")).toBe(false);
    expect(isPlausiblePaymentToken("has spaces in it and is long enough")).toBe(false);
    expect(isPlausiblePaymentToken("a".repeat(200))).toBe(false);
  });
});

describe("paymentLinkPath", () => {
  it("builds the public path", () => {
    expect(paymentLinkPath("abc_-123")).toBe("/pay/abc_-123");
  });

  it("encodes anything unsafe", () => {
    expect(paymentLinkPath("a/b?c")).toBe("/pay/a%2Fb%3Fc");
  });
});
