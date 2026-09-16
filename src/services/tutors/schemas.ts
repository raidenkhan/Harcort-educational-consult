import { z } from "zod";

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
  ratePerHour: z.coerce
    .number({ message: "Enter a valid hourly rate" })
    .min(0, "Rate cannot be negative")
    .max(100000, "Rate looks too high"),
});

export const tutorServiceSchema = z.object({
  courseId: z.string().uuid("Select a course"),
  price: z.coerce
    .number({ message: "Enter a valid price" })
    .min(0, "Price cannot be negative")
    .max(100000, "Price looks too high"),
});

export type TutorProfileInput = z.infer<typeof tutorProfileSchema>;
export type TutorServiceInput = z.infer<typeof tutorServiceSchema>;
