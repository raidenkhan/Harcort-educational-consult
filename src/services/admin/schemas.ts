import { z } from "zod";

/**
 * Admin tutor review. The acting admin is verified server-side (and again
 * inside the Postgres RPC); this only constrains the submitted target so a
 * malformed id can never reach the RPC.
 */
export const tutorReviewIdSchema = z.object({
  tutorProfileId: z.string().uuid("Unknown tutor profile"),
});

/** Free-text admin note — truncated rather than rejected, capped hard first. */
export const MAX_REVIEW_NOTE_LENGTH = 500;
