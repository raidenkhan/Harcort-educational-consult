import { describe, expect, it } from "vitest";
import { listUnpaidStudents } from "./unpaid";

const student = (id: string, joinedAt = "2026-11-01T00:00:00Z") => ({
  id,
  name: `Student ${id}`,
  publicCode: null,
  email: null,
  phone: null,
  joinedAt,
});

const engagement = (studentId: string, over: Partial<{ status: string; paidPesewas: bigint; courseTitle: string; tutorName: string }> = {}) => ({
  studentId,
  status: "pending_payment",
  paidPesewas: BigInt(0),
  courseTitle: "ME 261",
  tutorName: "Kofi",
  ...over,
});

describe("listUnpaidStudents", () => {
  it("splits unpaid students into picked-a-course and picked-nothing", () => {
    const { picked, notPicked } = listUnpaidStudents({
      students: [student("a"), student("b")],
      engagements: [engagement("a")],
      pendingRequests: [],
    });
    expect(picked.map((s) => s.id)).toEqual(["a"]);
    expect(picked[0].selections).toEqual([{ courseTitle: "ME 261", tutorName: "Kofi" }]);
    expect(notPicked.map((s) => s.id)).toEqual(["b"]);
  });

  it("leaves out anyone who has paid anything, even part of one course", () => {
    const { picked, notPicked } = listUnpaidStudents({
      students: [student("a")],
      engagements: [
        engagement("a", { paidPesewas: BigInt(100) }),
        engagement("a", { courseTitle: "ME 255" }),
      ],
      pendingRequests: [],
    });
    expect([...picked, ...notPicked]).toEqual([]);
  });

  it("counts pending requests as a selection and de-duplicates them", () => {
    const { picked } = listUnpaidStudents({
      students: [student("a")],
      engagements: [engagement("a")],
      pendingRequests: [
        { studentId: "a", courseTitle: "me 261", tutorName: "KOFI" },
        { studentId: "a", courseTitle: "ME 255", tutorName: "Esi" },
      ],
    });
    expect(picked[0].selections).toHaveLength(2);
  });

  it("ignores cancelled agreements", () => {
    const { picked, notPicked } = listUnpaidStudents({
      students: [student("a")],
      engagements: [engagement("a", { status: "cancelled" })],
      pendingRequests: [],
    });
    expect(picked).toEqual([]);
    expect(notPicked.map((s) => s.id)).toEqual(["a"]);
  });

  it("lists the newest sign-ups first and derives a first name", () => {
    const { notPicked } = listUnpaidStudents({
      students: [student("old", "2026-01-01T00:00:00Z"), student("new", "2026-11-01T00:00:00Z")],
      engagements: [],
      pendingRequests: [],
    });
    expect(notPicked.map((s) => s.id)).toEqual(["new", "old"]);
    expect(notPicked[0].firstName).toBe("Student");
  });
});
