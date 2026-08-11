import { z } from "zod";

/** Validation for the tutor "schedule a session" form. */
export const createSessionSchema = z.object({
  studentId: z.string().uuid("Select a student"),
  scheduledAt: z
    .string()
    .min(1, "Pick a date and time for the session"),
  durationMinutes: z.coerce
    .number({ message: "Enter a valid duration" })
    .min(15, "Sessions must be at least 15 minutes")
    .max(480, "Sessions can't exceed 8 hours"),
  topic: z
    .string()
    .trim()
    .max(120, "Topic is too long")
    .optional()
    .or(z.literal("")),
  location: z
    .string()
    .trim()
    .max(120, "Location is too long")
    .optional()
    .or(z.literal("")),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
