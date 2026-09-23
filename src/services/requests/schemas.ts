import { z } from "zod";

/**
 * Validation for the tutor-request flow — the structured first step before
 * payment (request-first, pay-after-acceptance).
 */

const uuid = (message: string) => z.string().uuid(message);

/** Student sends a tutoring request to an approved tutor. */
export const sendRequestSchema = z.object({
  tutorProfileId: uuid("Select a tutor"),
  courseId: z
    .string()
    .optional()
    .transform((v) => (v && v !== "" ? v : undefined))
    .refine((v) => v === undefined || z.string().uuid().safeParse(v).success, {
      message: "Invalid course",
    }),
  message: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters")
    .optional()
    .transform((v) => v ?? ""),
});

/** Tutor responds to a request. */
export const respondRequestSchema = z.object({
  requestId: uuid("Missing request"),
  accept: z
    .union([z.literal("accept"), z.literal("decline")])
    .transform((v) => v === "accept"),
});

export type SendRequestInput = z.infer<typeof sendRequestSchema>;
export type RespondRequestInput = z.infer<typeof respondRequestSchema>;
