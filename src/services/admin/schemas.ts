import { z } from "zod";
import { isValidCourseCode, normalizeCourseCode } from "@/services/courses/codes";

/**
 * Admin tutor review. The acting admin is verified server-side (and again
 * inside the Postgres RPC); this only constrains the submitted target so a
 * malformed id can never reach the RPC.
 */
export const tutorReviewIdSchema = z.object({
  tutorProfileId: z.string().uuid("Unknown tutor profile"),
});

/** Free-text admin note — truncated rather than rejected, capped hard first. */
export const MAX_REVIEW_NOTE_LENGTH = 500;

/** Optional form text: a missing control (null) or blank string → undefined. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined),
    z.string().max(max).optional(),
  );

/** Optional 1..N integer from a <select> ("" = not set). */
const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : Number(v)),
    z.number().int(message).min(min, message).max(max, message).optional(),
  );

/**
 * Admin → People → Add tutor. The admin sets a starting password and shares
 * it with the tutor; the account is created approved.
 */
export const createTutorSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the tutor's full name").max(120, "That name is too long"),
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "The password must be at least 8 characters")
    .max(128, "The password must be at most 128 characters"),
  /** Optional; same Ghana mobile rule as sign-up (0022). */
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\s+/g, "") : undefined),
    z
      .string()
      .regex(/^(\+233|233|0)\d{9}$/, "Enter a valid phone number, e.g. 0241234567")
      .optional(),
  ),
});

/** Admin → Courses → Add course. Published (approved) immediately. */
export const createCourseSchema = z
  .object({
    subject: z.string().trim().min(1, "Choose the programme").max(100, "That programme name is too long"),
    code: z.preprocess(
      (v) => (typeof v === "string" ? normalizeCourseCode(v) : ""),
      z.string().min(1, "Enter the course code, e.g. ME 261"),
    ),
    name: z.string().trim().min(2, "Enter the course name").max(160, "That course name is too long"),
    credits: optionalInt(0, 12, "Credit hours must be 0 to 12"),
    year: optionalInt(1, 4, "Choose Year 1 to 4"),
    semester: optionalInt(1, 2, "Choose Semester 1 or 2"),
    description: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.code && !isValidCourseCode(value.code)) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: "That doesn't look like a course code — use the form ME 261 or MATH 151.",
      });
    }
  });

/** A target id for the admin delete/hide actions. */
export const adminTargetSchema = z.object({ id: z.string().uuid("Unknown item") });
