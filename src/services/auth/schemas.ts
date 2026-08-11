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

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
