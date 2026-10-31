import { z } from "zod";

/**
 * Validation for the study-group server actions (0023). The actor is always
 * derived server-side from the session cookie — these schemas only constrain
 * the form payload (ids must be real uuids, message bodies length-capped).
 */

export const MAX_GROUP_MESSAGE_LENGTH = 2000;
export const MAX_GROUP_DESCRIPTION_LENGTH = 500;

const uuid = (message: string) => z.string().uuid(message);

/** Owner creates a group. `courseId`/`description` are optional. */
export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the group a name")
    .max(80, "Group names are limited to 80 characters"),
  courseId: z.string().uuid("Choose a course").optional(),
  description: z
    .string()
    .trim()
    .max(
      MAX_GROUP_DESCRIPTION_LENGTH,
      `Descriptions are limited to ${MAX_GROUP_DESCRIPTION_LENGTH} characters`,
    )
    .optional(),
});

/** Student joins a group by its shared code (case-insensitive, trimmed). */
export const joinGroupSchema = z.object({
  joinCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,12}$/, "Enter the code your tutor shared")
    .transform((code) => code.toUpperCase()),
});

/** Send a message into a group the caller belongs to. */
export const sendGroupMessageSchema = z.object({
  groupId: uuid("Missing group"),
  body: z
    .string()
    .trim()
    .min(1, "Type a message first")
    .max(
      MAX_GROUP_MESSAGE_LENGTH,
      `Messages are limited to ${MAX_GROUP_MESSAGE_LENGTH} characters`,
    ),
});

/** A bare group id — for leave / archive / mark-read / one-tap join. */
export const groupIdSchema = z.object({
  groupId: uuid("Missing group"),
});

export const MAX_GROUP_MEMBERS_PER_ADD = 50;

/**
 * A tutor adds students to a group they own (0036).
 *
 * The ids arrive as repeated `studentId` controls, not a JSON blob, so the
 * action collects them with `formData.getAll`. Duplicates are collapsed here
 * (a checkbox list can't produce them, but a crafted post can) and the cap
 * keeps one submit from inserting thousands of rows.
 */
export const addGroupMembersSchema = z.object({
  groupId: uuid("Missing group"),
  profileIds: z
    .array(uuid("Pick a student"))
    .transform((ids) => [...new Set(ids)])
    .pipe(
      z
        .array(z.string().uuid())
        .min(1, "Pick at least one student")
        .max(
          MAX_GROUP_MEMBERS_PER_ADD,
          `Add at most ${MAX_GROUP_MEMBERS_PER_ADD} students at a time`,
        ),
    ),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
export type SendGroupMessageInput = z.infer<typeof sendGroupMessageSchema>;
export type AddGroupMembersInput = z.infer<typeof addGroupMembersSchema>;
