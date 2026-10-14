import { describe, expect, it } from "vitest";
import {
  resetRedeemSchema,
  setPhoneSchema,
  setSessionModeSchema,
  signInSchema,
  signUpSchema,
  switchRoleSchema,
} from "./schemas";

describe("signUpSchema", () => {
  const validStudent = {
    email: "student@knust.edu.gh",
    password: "longenough",
    fullName: "Kwame Mensah",
    role: "student",
    program: "Mechanical Engineering",
    year: 2,
    sessionMode: "one_on_one",
    phone: "0241234567",
  };

  it("accepts a fully-specified student signup", () => {
    expect(signUpSchema.safeParse(validStudent).success).toBe(true);
  });

  it("accepts a tutor signup with none of the student-only fields", () => {
    const result = signUpSchema.safeParse({
      email: "tutor@knust.edu.gh",
      password: "longenough",
      fullName: "Ama Tutor",
      role: "tutor",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.program).toBeUndefined();
      expect(result.data.year).toBeUndefined();
      expect(result.data.sessionMode).toBeUndefined();
      expect(result.data.phone).toBeUndefined();
    }
  });

  it("requires a program for a student", () => {
    expect(
      signUpSchema.safeParse({ ...validStudent, program: undefined }).success,
    ).toBe(false);
  });

  it("requires a year for a student", () => {
    expect(
      signUpSchema.safeParse({ ...validStudent, year: undefined }).success,
    ).toBe(false);
  });

  it("rejects a year outside 1–4", () => {
    for (const year of [0, 5, 99]) {
      expect(signUpSchema.safeParse({ ...validStudent, year }).success).toBe(
        false,
      );
    }
  });

  it("rejects an invalid email", () => {
    expect(
      signUpSchema.safeParse({ ...validStudent, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("rejects a short password", () => {
    expect(
      signUpSchema.safeParse({ ...validStudent, password: "short" }).success,
    ).toBe(false);
  });

  it("rejects self-registration as admin", () => {
    expect(
      signUpSchema.safeParse({ ...validStudent, role: "admin" }).success,
    ).toBe(false);
  });

  it("accepts both session formats (0021)", () => {
    for (const sessionMode of ["one_on_one", "group"]) {
      expect(
        signUpSchema.safeParse({ ...validStudent, sessionMode }).success,
      ).toBe(true);
    }
  });

  it("rejects an unknown session format", () => {
    expect(
      signUpSchema.safeParse({ ...validStudent, sessionMode: "pair" }).success,
    ).toBe(false);
  });

  it("accepts the Ghana phone formats and rejects junk (0022)", () => {
    for (const phone of ["0241234567", "233241234567", "+233241234567"]) {
      expect(signUpSchema.safeParse({ ...validStudent, phone }).success).toBe(
        true,
      );
    }
    for (const phone of ["12345", "not-a-phone", "02412345678"]) {
      expect(signUpSchema.safeParse({ ...validStudent, phone }).success).toBe(
        false,
      );
    }
  });

  it("leaves phone optional — a blank or absent number is fine", () => {
    expect(
      signUpSchema.safeParse({ ...validStudent, phone: undefined }).success,
    ).toBe(true);
  });
});

describe("setPhoneSchema", () => {
  it("accepts a valid number and an absent one — clearing is allowed", () => {
    expect(setPhoneSchema.safeParse({ phone: "0241234567" }).success).toBe(true);
    expect(setPhoneSchema.safeParse({ phone: undefined }).success).toBe(true);
    expect(setPhoneSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a malformed number", () => {
    expect(setPhoneSchema.safeParse({ phone: "12345" }).success).toBe(false);
  });
});

describe("setSessionModeSchema", () => {
  it("accepts the two formats", () => {
    expect(setSessionModeSchema.safeParse({ sessionMode: "one_on_one" }).success).toBe(true);
    expect(setSessionModeSchema.safeParse({ sessionMode: "group" }).success).toBe(true);
  });

  it("rejects a missing or unknown value — an explicit choice is required", () => {
    expect(setSessionModeSchema.safeParse({}).success).toBe(false);
    expect(setSessionModeSchema.safeParse({ sessionMode: undefined }).success).toBe(false);
    expect(setSessionModeSchema.safeParse({ sessionMode: "GROUP" }).success).toBe(false);
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

describe("switchRoleSchema", () => {
  it("accepts student and tutor", () => {
    expect(switchRoleSchema.safeParse({ role: "student" }).success).toBe(true);
    expect(switchRoleSchema.safeParse({ role: "tutor" }).success).toBe(true);
  });

  it("rejects admin and anything else — admin is never switchable", () => {
    expect(switchRoleSchema.safeParse({ role: "admin" }).success).toBe(false);
    expect(switchRoleSchema.safeParse({ role: "" }).success).toBe(false);
    expect(switchRoleSchema.safeParse({ role: "TUTOR" }).success).toBe(false);
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
