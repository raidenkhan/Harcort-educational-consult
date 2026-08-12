import { describe, expect, it } from "vitest";
import { resetRedeemSchema, signInSchema, signUpSchema } from "./schemas";

describe("signUpSchema", () => {
  it("accepts a valid signup", () => {
    const result = signUpSchema.safeParse({
      email: "student@knust.edu.gh",
      password: "longenough",
      fullName: "Kwame Mensah",
      role: "tutor",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signUpSchema.safeParse({
      email: "not-an-email",
      password: "longenough",
      fullName: "Kwame",
      role: "student",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({
      email: "a@b.com",
      password: "short",
      fullName: "Kwame",
      role: "student",
    });
    expect(result.success).toBe(false);
  });

  it("rejects self-registration as admin", () => {
    const result = signUpSchema.safeParse({
      email: "a@b.com",
      password: "longenough",
      fullName: "Kwame",
      role: "admin",
    });
    expect(result.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("accepts email + password", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });

  it("rejects a blank password", () => {
    expect(signInSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("resetRedeemSchema", () => {
  it("accepts an 8-digit code", () => {
    expect(
      resetRedeemSchema.safeParse({
        email: "a@b.com",
        code: "12345678",
        password: "newpassword",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed code", () => {
    for (const code of ["1234567", "abcdefgh", "123456789"]) {
      expect(
        resetRedeemSchema.safeParse({ email: "a@b.com", code, password: "newpassword" }).success,
      ).toBe(false);
    }
  });
});
