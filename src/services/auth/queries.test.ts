import { describe, expect, it } from "vitest";
import { profileIsAdmin } from "@/lib/auth/admin";

describe("profileIsAdmin", () => {
  it("treats the legacy role='admin' as admin", () => {
    expect(profileIsAdmin({ role: "admin", is_admin: false })).toBe(true);
  });

  it("honors the is_admin flag regardless of role (admin-tutors)", () => {
    expect(profileIsAdmin({ role: "tutor", is_admin: true })).toBe(true);
  });

  it("is false for plain students and tutors", () => {
    expect(profileIsAdmin({ role: "student", is_admin: false })).toBe(false);
    expect(profileIsAdmin({ role: "tutor", is_admin: false })).toBe(false);
  });
});
