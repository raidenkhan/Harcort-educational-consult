import { z } from "zod";
import { SESSION_MODES } from "@/services/auth/sessionFormat";

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
  /** How the student wants THIS engagement tutored — chosen at booking time
   *  and stored on the request itself (0024), never as a global preference.
   *  Defaults to one-on-one when absent. */
  sessionMode: z.enum(SESSION_MODES).optional(),
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

/** A student asks the admin team for a payment plan from the paywall. */
export const paymentPlanRequestSchema = z.object({
  requestId: uuid("Missing request"),
  note: z
    .string()
    .trim()
    .max(300, "Keep the note under 300 characters")
    .optional()
    .transform((v) => v ?? ""),
});

export type PaymentPlanRequestInput = z.infer<typeof paymentPlanRequestSchema>;
