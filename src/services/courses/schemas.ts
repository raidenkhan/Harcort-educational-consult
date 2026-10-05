import { z } from "zod";

/**
 * Validation for the course library (materials + tutorial videos).
 *
 * The admin actor is always re-derived server-side from the session cookie —
 * these schemas only constrain the payload. The category/file-format
 * allowlists live here (not in Postgres) so adding a value is a one-line code
 * change with no migration.
 */

/** Material categories the admin console offers. */
export const MATERIAL_CATEGORIES = [
  "Course Outline",
  "Lecture Notes",
  "Formula Sheet",
  "Recommended Textbook",
  "Study Guide",
  "Lab Manual",
] as const;

export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

/** `LINK` is for resources that live somewhere else entirely (a departmental
 *  page, a Drive folder) rather than a document in a known format. */
export const FILE_FORMATS = ["PDF", "DOCX", "EPUB", "LINK"] as const;

export type FileFormat = (typeof FILE_FORMATS)[number];

/** A YouTube video id is always 11 characters from this alphabet. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Term tag (0018). Coerced so a form can send `"1"`; a blank value must be
 * passed through as `undefined` by the caller (an empty select means "not
 * assigned yet", which is valid — NOT an error).
 */
export const semesterField = z.coerce
  .number()
  .int("Choose a semester")
  .refine((value) => value === 1 || value === 2, {
    error: "Choose Semester 1 or 2",
  })
  .optional();

const uuid = (message: string) => z.string().uuid(message);

export const createMaterialSchema = z.object({
  courseId: uuid("Select a course"),
  title: z
    .string()
    .trim()
    .min(3, "Give the material a title")
    .max(160, "Keep the title under 160 characters"),
  category: z.enum(MATERIAL_CATEGORIES, { error: "Choose a category" }),
  fileFormat: z.enum(FILE_FORMATS, { error: "Choose a file format" }),
  fileUrl: z
    .string()
    .trim()
    .url("Enter a valid link (https://…)")
    .max(500, "Keep the link under 500 characters"),
  description: z
    .string()
    .trim()
    .max(500, "Keep the description under 500 characters")
    .optional(),
  semester: semesterField,
});

export const createVideoSchema = z.object({
  courseId: uuid("Select a course"),
  videoId: z
    .string()
    .trim()
    .regex(YOUTUBE_ID, "Enter the 11-character YouTube video id"),
  title: z
    .string()
    .trim()
    .min(3, "Give the video a title")
    .max(160, "Keep the title under 160 characters"),
  topic: z.string().trim().max(80, "Keep the topic under 80 characters").optional(),
  duration: z
    .string()
    .trim()
    .max(16, "Keep the duration short (e.g. 24:18)")
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, "Keep the description under 500 characters")
    .optional(),
  sortOrder: z.coerce
    .number()
    .int("Order must be a whole number")
    .min(0, "Order cannot be negative")
    .max(999, "Keep the order under 1000")
    .optional(),
  semester: semesterField,
});

/** Delete by id — used by both asset types. */
export const courseAssetIdSchema = z.object({
  id: uuid("Missing asset"),
});

/** Set the year tier on a course (0020). `year` null clears it ("All years"). */
export const setCourseYearSchema = z.object({
  courseId: uuid("Select a course"),
  year: z
    .number()
    .int("Choose a year")
    .refine((value) => value >= 1 && value <= 4, {
      error: "Choose Year 1 to 4",
    })
    .nullable(),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type CreateVideoInput = z.infer<typeof createVideoSchema>;
