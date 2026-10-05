import { z } from "zod";

/** Validation schemas for auth forms. Shared by actions and UI. */

export const signUpSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  fullName: z.string().trim().min(2, "Enter your full name"),
  role: z.enum(["student", "tutor"], {
    error: "Choose whether you're a student or a tutor",
  }),
});

export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(128, "Enter your password"),
});

/** Self-service role switch (student ↔ tutor). Admin is impossible. */
export const switchRoleSchema = z.object({
  role: z.enum(["student", "tutor"], {
    error: "Invalid role.",
  }),
});

/** A student declares their program (a `courses.subject` value) and year
 *  (1–4, optional). */
export const setStudyPrefsSchema = z.object({
  program: z
    .string()
    .trim()
    .min(1, "Choose a program")
    .max(100, "Program name is too long"),
  year: z
    .number()
    .int("Choose a year")
    .refine((value) => value >= 1 && value <= 4, {
      error: "Choose Year 1 to 4",
    })
    .optional(),
});

/** Admin issues a one-time reset code for a user's email. */
export const resetRequestSchema = z.object({
  email: z.email("Enter a valid email address"),
});

/** User redeems a code with a new password (no session required). */
export const resetRedeemSchema = z.object({
  email: z.email("Enter a valid email address"),
  code: z
    .string()
    .trim()
    .regex(/^\d{8}$/, "Enter the 8-digit code"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type SwitchRoleInput = z.infer<typeof switchRoleSchema>;
export type SetStudyPrefsInput = z.infer<typeof setStudyPrefsSchema>;
export type ResetRedeemInput = z.infer<typeof resetRedeemSchema>;
