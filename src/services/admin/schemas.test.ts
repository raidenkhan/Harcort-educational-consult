import { describe, expect, it } from "vitest";
import { createCourseSchema, createTutorSchema } from "./schemas";

describe("createTutorSchema", () => {
  it("accepts a tutor with an optional phone", () => {
    const parsed = createTutorSchema.parse({
      fullName: " Ama Mensah ",
      email: "ama@example.com",
      password: "longenough",
      phone: "",
    });
    expect(parsed.fullName).toBe("Ama Mensah");
    expect(parsed.phone).toBeUndefined();
  });

  it("rejects a short password and a bad email with human messages", () => {
    const result = createTutorSchema.safeParse({ fullName: "Ama", email: "nope", password: "short" });
    expect(result.success).toBe(false);
    const messages = result.success ? [] : result.error.issues.map((i) => i.message);
    expect(messages).toContain("Enter a valid email address");
    expect(messages).toContain("The password must be at least 8 characters");
  });
});

describe("createCourseSchema", () => {
  const base = { subject: "Mechanical Engineering", code: "me  261", name: "Dynamics" };

  it("normalises the code and treats blank selects as not set", () => {
    const parsed = createCourseSchema.parse({ ...base, credits: "3", year: "", semester: null, description: " " });
    expect(parsed.code).toBe("ME 261");
    expect(parsed.credits).toBe(3);
    expect(parsed.year).toBeUndefined();
    expect(parsed.semester).toBeUndefined();
    expect(parsed.description).toBeUndefined();
  });

  it("rejects prose typed into the code box", () => {
    const result = createCourseSchema.safeParse({ ...base, code: "Dynamics of machines" });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range year and semester", () => {
    expect(createCourseSchema.safeParse({ ...base, year: "5" }).success).toBe(false);
    expect(createCourseSchema.safeParse({ ...base, semester: "3" }).success).toBe(false);
  });
});
