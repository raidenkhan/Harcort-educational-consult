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

/**
 * Admin records a payment collected OUTSIDE Paystack (cash, personal MoMo,
 * bank transfer) against a student's agreement. Amount arrives in cedis —
 * the usual display unit — and is converted to pesewas server-side.
 */
export const recordPartPaymentSchema = z.object({
  engagementId: uuid("Missing engagement"),
  amountCedis: z.coerce
    .number({ message: "Enter the amount collected" })
    .positive("Enter an amount above zero")
    .max(100000, "Amount looks too high"),
  note: z.string().trim().max(280, "Keep the note under 280 characters").optional(),
});

// ---------------------------------------------------------------------------
// Payment plans & part-payment links (0032)
// ---------------------------------------------------------------------------

/**
 * Admin opens a plan for a student who reached the paywall and asked for help.
 * The queue row is a tutor REQUEST (there is no agreement yet) — opening the
 * plan is what creates one, which is what makes a part payment recordable.
 */
export const openPlanSchema = z.object({
  requestId: uuid("Pick a request to open a plan for"),
});

/**
 * Admin issues a single-use part-payment link. `amountCedis` is what the
 * student will be charged through that link — the RPC re-checks it against
 * the live outstanding balance, so a link can never exceed what is owed.
 */
export const createPaymentRequestSchema = z.object({
  engagementId: uuid("Missing agreement"),
  amountCedis: z.coerce
    .number({ message: "Enter the amount to collect" })
    .positive("Enter an amount above zero")
    .max(100000, "Amount looks too high"),
  note: z.string().trim().max(280, "Keep the note under 280 characters").optional(),
  validDays: z.coerce
    .number()
    .int("Use whole days")
    .min(1, "A link must stay valid for at least a day")
    .max(60, "Keep links valid for 60 days at most")
    .default(7),
});

/**
 * The agreed date the balance will be settled. A blank date CLEARS the
 * promise (the admin may have set it by mistake, or the plan changed).
 */
export const setPaymentPromiseSchema = z.object({
  engagementId: uuid("Missing agreement"),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date")
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
      message: "Pick a valid date",
    })
    .optional(),
});

/** Admin cancels an open link (paid links are immutable — the money row is
 *  the record). */
export const cancelPaymentRequestSchema = z.object({
  requestId: uuid("Missing payment link"),
});

/** Student pays an admin-issued link. The token is the whole credential —
 *  the server hashes it and looks the link up. */
export const payPaymentRequestSchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{20,64}$/, "This payment link is not valid"),
});

export type CreateEngagementInput = z.infer<typeof createEngagementSchema>;
export type InitializeInstallmentPaymentInput = z.infer<
  typeof initializeInstallmentPaymentSchema
>;
export type SavePayoutAccountInput = z.infer<typeof savePayoutAccountSchema>;
