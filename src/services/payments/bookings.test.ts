import { describe, expect, it } from "vitest";
import {
  orderBookings,
  semestersLabel,
  summarizeBookings,
  type StudentBooking,
} from "./bookings";

const booking = (over: Partial<StudentBooking>): StudentBooking => ({
  id: "b1",
  status: "active",
  courseName: "Dynamics",
  courseCode: "ME 261",
  tutorName: "Kofi",
  tutorCode: "HC-T-1",
  sessionMode: "one_on_one",
  semesters: 1,
  agreedTotal: BigInt(6_000),
  paidPesewas: BigInt(6_000),
  createdAt: "2026-11-01T00:00:00Z",
  ...over,
});

describe("summarizeBookings", () => {
  it("counts confirmed courses, tutors and semesters", () => {
    const summary = summarizeBookings([
      booking({ id: "a", semesters: 2 }),
      booking({ id: "b", courseCode: "ME 255", courseName: "Thermo", tutorCode: "HC-T-2", tutorName: "Esi", semesters: 1 }),
    ]);
    expect(summary).toMatchObject({ coursesBooked: 2, tutorsBooked: 2, semestersBooked: 3, awaitingCount: 0 });
  });

  it("treats duplicate course rows (same code) as one course", () => {
    const summary = summarizeBookings([
      booking({ id: "a", courseCode: "ME 261" }),
      booking({ id: "b", courseCode: "me  261", tutorCode: "HC-T-2" }),
    ]);
    expect(summary.coursesBooked).toBe(1);
    expect(summary.tutorsBooked).toBe(2);
  });

  it("keeps unpaid bookings out of the totals but counts what they owe", () => {
    const summary = summarizeBookings([
      booking({ id: "a", status: "pending_payment", paidPesewas: BigInt(0), agreedTotal: BigInt(12_000) }),
      booking({ id: "b", status: "cancelled" }),
    ]);
    expect(summary).toMatchObject({ coursesBooked: 0, semestersBooked: 0, awaitingCount: 1 });
    expect(summary.awaitingPesewas).toBe(BigInt(12_000));
  });
});

describe("orderBookings", () => {
  it("puts awaiting payment first, newest first, and drops cancelled", () => {
    const ordered = orderBookings([
      booking({ id: "old", createdAt: "2026-10-01T00:00:00Z" }),
      booking({ id: "new", createdAt: "2026-11-05T00:00:00Z" }),
      booking({ id: "due", status: "pending_payment" }),
      booking({ id: "gone", status: "cancelled" }),
    ]);
    expect(ordered.map((b) => b.id)).toEqual(["due", "new", "old"]);
  });
});

describe("semestersLabel", () => {
  it("pluralises", () => {
    expect(semestersLabel(1)).toBe("1 semester");
    expect(semestersLabel(3)).toBe("3 semesters");
    expect(semestersLabel(0)).toBe("1 semester");
  });
});
