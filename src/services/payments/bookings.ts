import { normalizeCourseCode } from "@/services/courses/codes";

/**
 * A student's bookings and their at-a-glance totals (pure, unit-tested) —
 * the student Home overview. A "booking" is a payment agreement for one
 * course with one tutor (`engagements`, created when the student books and
 * pays from the Book-tutor dialog, the cart, or a course page).
 *
 *   confirmed  active or completed — paid enough that the booking stands
 *   awaiting   pending_payment — booked but not paid yet
 *   cancelled  ignored everywhere
 */

export interface StudentBooking {
  id: string;
  status: "pending_payment" | "active" | "completed" | "cancelled";
  courseName: string;
  courseCode: string | null;
  tutorName: string;
  tutorCode: string | null;
  sessionMode: "one_on_one" | "group" | null;
  /** How many semesters were bought (0041); 1 for older agreements. */
  semesters: number;
  agreedTotal: bigint;
  paidPesewas: bigint;
  createdAt: string;
}

export interface BookingSummary {
  /** Distinct courses with a confirmed booking (by code, then name). */
  coursesBooked: number;
  /** Distinct tutors with a confirmed booking. */
  tutorsBooked: number;
  /** Semesters of tutoring booked across confirmed bookings. */
  semestersBooked: number;
  /** Bookings made but not paid yet, and what they still need. */
  awaitingCount: number;
  awaitingPesewas: bigint;
}

const isConfirmed = (b: StudentBooking) => b.status === "active" || b.status === "completed";

export function summarizeBookings(bookings: StudentBooking[]): BookingSummary {
  const confirmed = bookings.filter(isConfirmed);
  const awaiting = bookings.filter((b) => b.status === "pending_payment");
  const courseKey = (b: StudentBooking) =>
    normalizeCourseCode(b.courseCode) || `name:${b.courseName.trim().toLowerCase()}`;
  return {
    coursesBooked: new Set(confirmed.map(courseKey)).size,
    tutorsBooked: new Set(confirmed.map((b) => b.tutorCode ?? b.tutorName)).size,
    semestersBooked: confirmed.reduce((sum, b) => sum + Math.max(1, b.semesters), 0),
    awaitingCount: awaiting.length,
    awaitingPesewas: awaiting.reduce(
      (sum, b) => sum + (b.agreedTotal - b.paidPesewas > BigInt(0) ? b.agreedTotal - b.paidPesewas : BigInt(0)),
      BigInt(0),
    ),
  };
}

/** Live bookings for the Home list: awaiting payment first, then confirmed,
 *  newest first within each; cancelled ones are dropped. */
export function orderBookings(bookings: StudentBooking[]): StudentBooking[] {
  const rank = (b: StudentBooking) => (b.status === "pending_payment" ? 0 : 1);
  return bookings
    .filter((b) => b.status !== "cancelled")
    .sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
}

/** "1 semester" / "3 semesters". */
export function semestersLabel(n: number): string {
  const count = Math.max(1, n);
  return `${count} semester${count === 1 ? "" : "s"}`;
}
