/**
 * Session format — how a student wants to be tutored: one-on-one with the
 * tutor, or a group session shared with classmates (0021).
 *
 * Chosen at sign-up, editable from the dashboard, and shown to the tutor on
 * every request they receive. Pure and dependency-free so the normalization
 * rules are unit-tested rather than buried in JSX.
 */

/** Every stored value. The Zod schema and the DB CHECK both derive from this. */
export const SESSION_MODES = ["one_on_one", "group"] as const;

export type SessionMode = (typeof SESSION_MODES)[number];

/**
 * The DB default, and the fallback for anything unrecognized — including a
 * profile read before migration 0021 is applied, where the column is simply
 * absent and the value arrives as `undefined`.
 */
export const DEFAULT_SESSION_MODE: SessionMode = "one_on_one";

/** Anything that isn't 'group' is one-on-one; never throws, never returns
 *  null, so every render path has a concrete format to show. */
export function normalizeSessionMode(value: unknown): SessionMode {
  return value === "group" ? "group" : DEFAULT_SESSION_MODE;
}

/** Short label for badges and summaries. */
export function sessionModeLabel(value: unknown): string {
  return normalizeSessionMode(value) === "group" ? "Group session" : "One-on-one";
}
