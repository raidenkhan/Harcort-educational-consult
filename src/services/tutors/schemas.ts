import { z } from "zod";
import {
  COURSE_CODE_MAX,
  isValidCourseCode,
  normalizeCourseCode,
} from "@/services/courses/codes";

/** Validation schemas for tutor onboarding. */

export const tutorProfileSchema = z.object({
  bio: z
    .string()
    .trim()
    .min(10, "Tell us a bit about yourself (min 10 characters)")
    .max(2000, "Keep your bio under 2000 characters"),
  qualifications: z
    .string()
    .trim()
    .min(5, "List your qualifications / experience")
    .max(500, "Keep your qualifications under 500 characters"),
  ratePerSemester: z.coerce
    .number({ message: "Enter a valid semester rate" })
    .min(0, "Rate cannot be negative")
    .max(100000, "Rate looks too high"),
});

/** A blank form field means "not set", not zero — and not an error. */
const blankToUndefined = (value: unknown) =>
  value === "" || value === null || value === undefined ? undefined : value;

const optionalMoney = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ message: "Enter a valid price" })
    .min(0, "Price cannot be negative")
    .max(100000, "Price looks too high")
    .optional(),
);

const optionalUuid = z.preprocess(
  blankToUndefined,
  z.string().uuid("Select a course").optional(),
);

/**
 * Add (or re-price) a course offering (0031).
 *
 * The tutor either picks a catalog course or adds a new one by code. Prices
 * are per session format and EITHER may be blank — blank means "I don't
 * teach this course in that format", and the request UI will not offer it.
 * At least one must be set, otherwise the row is a free course.
 */
export const tutorServiceSchema = z
  .object({
    courseId: optionalUuid,

    // Only used when the tutor adds a course the catalog doesn't have.
    newCourseCode: z
      .string()
      .trim()
      .max(COURSE_CODE_MAX, "That code is too long")
      .optional(),
    newCourseName: z
      .string()
      .trim()
      .max(160, "Keep the course name under 160 characters")
      .optional(),
    newCourseSubject: z
      .string()
      .trim()
      .max(120, "Keep the programme name under 120 characters")
      .optional(),
    newCourseYear: z.preprocess(
      blankToUndefined,
      z.coerce
        .number()
        .int()
        .min(1, "Choose Level 100–400")
        .max(4, "Choose Level 100–400")
        .optional(),
    ),
    newCourseSemester: z.preprocess(
      blankToUndefined,
      z.coerce
        .number()
        .int()
        .refine((value) => value === 1 || value === 2, {
          message: "Choose Semester 1 or 2",
        })
        .optional(),
    ),

    priceGroup: optionalMoney,
    priceOneOnOne: optionalMoney,
  })
  .superRefine((value, ctx) => {
    if (value.priceGroup == null && value.priceOneOnOne == null) {
      ctx.addIssue({
        code: "custom",
        path: ["priceOneOnOne"],
        message: "Set a one-on-one price, a group price, or both.",
      });
    }

    const code = normalizeCourseCode(value.newCourseCode);
    const addingCourse = code.length > 0;

    if (!addingCourse && !value.courseId) {
      ctx.addIssue({
        code: "custom",
        path: ["courseId"],
        message: "Pick a course, or add a new one with its course code.",
      });
    }

    if (!addingCourse) return;

    if (!isValidCourseCode(code)) {
      ctx.addIssue({
        code: "custom",
        path: ["newCourseCode"],
        message: "Enter the KNUST course code, e.g. ME 158.",
      });
    }
    if (!value.newCourseName || value.newCourseName.length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["newCourseName"],
        message: "Give the course its full name.",
      });
    }
    if (!value.newCourseSubject || value.newCourseSubject.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["newCourseSubject"],
        message: "Choose the programme the course belongs to.",
      });
    }
    if (value.newCourseYear == null) {
      ctx.addIssue({
        code: "custom",
        path: ["newCourseYear"],
        message: "Choose the level the course is taken at.",
      });
    }
    if (value.newCourseSemester == null) {
      ctx.addIssue({
        code: "custom",
        path: ["newCourseSemester"],
        message: "Choose the semester the course runs in.",
      });
    }
  });

export type TutorProfileInput = z.infer<typeof tutorProfileSchema>;
export type TutorServiceInput = z.infer<typeof tutorServiceSchema>;
