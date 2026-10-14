import { z } from "zod";
import { SESSION_MODES } from "./sessionFormat";

/** Validation schemas for auth forms. Shared by actions and UI. */

/**
 * Email + password + role + session mode (0021) + program/year (0019/0020) +
 * phone (0022).
 *
 * Program and year are REQUIRED for students and omitted for tutors: the
 * role-conditional rule lives in `superRefine` (not `.optional()` on each
 * field), because "required sometimes" isn't expressible as a field-level
 * modifier. Fields the tutor form never renders are coerced to `undefined` at
 * the action boundary (`formData.get` returns null for an absent input).
 */
export const signUpSchema = z
  .object({
    email: z.email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    fullName: z.string().trim().min(2, "Enter your full name"),
    role: z.enum(["student", "tutor"], {
      error: "Choose whether you're a student or a tutor",
    }),
    /** How the student wants their sessions (0021) — OPTIONAL on purpose: the
     *  picker is only rendered for the student role, so a tutor sign-up sends
     *  nothing and the DB default ('one_on_one') applies. */
    sessionMode: z.enum(SESSION_MODES).optional(),
    /** A `courses.subject` value (0019). Student-only; see superRefine. */
    program: z
      .string()
      .trim()
      .max(100, "Program name is too long")
      .optional(),
    /** The student's year, 1–4 (0020). Student-only; see superRefine. */
    year: z
      .number()
      .int("Choose a year")
      .refine((value) => value >= 1 && value <= 4, {
        error: "Choose Year 1 to 4",
      })
      .optional(),
    /** Optional for every role (0022). Ghana mobile format; the SMS layer
     *  normalizes to Arkesel's digits-only form when it actually sends. */
    phone: z
      .string()
      .trim()
      .regex(
        /^(\+233|233|0)\d{9}$/,
        "Enter a valid phone number, e.g. 0241234567",
      )
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role !== "student") return;
    if (!value.program) {
      ctx.addIssue({
        code: "custom",
        path: ["program"],
        message: "Choose a program",
      });
    }
    if (value.year == null) {
      ctx.addIssue({
        code: "custom",
        path: ["year"],
        message: "Choose Year 1 to 4",
      });
    }
  });

/** A student changes their session format from the dashboard. Required —
 *  this is an explicit choice, not a default-on-absence field. */
export const setSessionModeSchema = z.object({
  sessionMode: z.enum(SESSION_MODES, {
    error: "Choose one-on-one or a group session",
  }),
});

/** A student declares their program (a `courses.subject` value) and year
 *  (1–4, optional). Used at sign-up and from the dashboard. */
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

/** Self-service role switch (student ↔ tutor). Admin is impossible. */
export const switchRoleSchema = z.object({
  role: z.enum(["student", "tutor"], {
    error: "Invalid role.",
  }),
});

/** A simple sign-in input type (email + password). */
export const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter a password").max(128, "Enter your password"),
});

/** Type exports */
export type SignUpInput = z.infer<typeof signUpSchema>;

/** A user sets (or clears) their phone from the dashboard (0022). Empty is
 *  valid — clearing a number is a first-class action, not an error. */
export const setPhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^(\+233|233|0)\d{9}$/, "Enter a valid phone number, e.g. 0241234567")
    .optional(),
});

/** Switch role input type */
export type SwitchRoleInput = z.infer<typeof switchRoleSchema>;

/** Phone input type */
export type SetPhoneInput = z.infer<typeof setPhoneSchema>;

/** Study prefs input type */
export type SetStudyPrefsInput = z.infer<typeof setStudyPrefsSchema>;

/** Session mode input type */
export type SetSessionModeInput = z.infer<typeof setSessionModeSchema>;

/** Reset redeem input type */
export type ResetRedeemInput = z.infer<typeof resetRedeemSchema>;
