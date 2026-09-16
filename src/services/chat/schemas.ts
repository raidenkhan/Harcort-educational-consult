import { z } from "zod";

/**
 * Validation for the chat server actions. The actor is always derived
 * server-side from the session cookie — these schemas only constrain the
 * form payload (ids must be real uuids, message bodies are length-capped).
 */

export const MAX_MESSAGE_LENGTH = 2000;

const uuid = (message: string) => z.string().uuid(message);

/** Student starts (or re-enters) a conversation with a tutor. */
export const startConversationSchema = z.object({
  tutorProfileId: uuid("Select a tutor"),
});

/** Send a message in a conversation. */
export const sendMessageSchema = z.object({
  conversationId: uuid("Missing conversation"),
  body: z
    .string()
    .trim()
    .min(1, "Type a message first")
    .max(MAX_MESSAGE_LENGTH, `Messages are limited to ${MAX_MESSAGE_LENGTH} characters`),
});

/** Admin starts (or re-enters) a conversation with a student or tutor. */
export const startAdminConversationSchema = z.object({
  targetType: z.enum(["student", "tutor"], {
    error: "Choose someone to message",
  }),
  targetId: uuid("Choose someone to message"),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type StartAdminConversationInput = z.infer<
  typeof startAdminConversationSchema
>;
