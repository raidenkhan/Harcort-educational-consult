import { z } from "zod";

/**
 * Validation for the payments domain. The actor is always derived
 * server-side from the session cookie — schemas only constrain the payload.
 * Amounts are NEVER accepted from the client: the server re-derives them
 * from the engagement snapshot (migration 0011 RPCs enforce this too).
 */

const uuid = (message: string) => z.string().uuid(message);

/** Student (or admin) commits to a tutor's quoted course. */
export const createEngagementSchema = z.object({
  tutorServiceId: uuid("Select a course to pay for"),
});

/** Paystack checkout for one installment. */
export const initializeInstallmentPaymentSchema = z.object({
  engagementId: uuid("Missing engagement"),
  installmentId: uuid("Missing installment"),
});

/** Tutor registers (or updates) their MoMo payout account. */
export const savePayoutAccountSchema = z.object({
  provider: z.enum(["mtn", "telecel", "airteltigo"], {
    error: "Choose your mobile money network",
  }),
  phone: z
    .string()
    .trim()
    .min(9, "Enter your mobile money number")
    .max(12, "Enter a valid Ghana mobile number"),
});

export type CreateEngagementInput = z.infer<typeof createEngagementSchema>;
export type InitializeInstallmentPaymentInput = z.infer<
  typeof initializeInstallmentPaymentSchema
>;
export type SavePayoutAccountInput = z.infer<typeof savePayoutAccountSchema>;
