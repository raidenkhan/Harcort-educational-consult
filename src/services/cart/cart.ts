import {
  normalizeSessionMode,
  type SessionMode,
} from "@/services/auth/sessionFormat";

/**
 * Cart lines — the pure half.
 *
 * The cart is a client-side wish list (`localStorage`): no DB row exists
 * until checkout. That makes it cheap, but it also means the browser can
 * hand us anything — an old schema, a hand-edited value, a half-written
 * entry. These helpers validate, dedupe and total it, and the provider never
 * touches storage without going through them.
 *
 * Prices stored here are DISPLAY ONLY. Checkout re-derives every amount from
 * `tutor_services` inside `prepare_cart_engagement` / `create_payment_batch`,
 * so an edited localStorage value can never change what is charged.
 */

export const CART_STORAGE_KEY = "harcourt.cart.v1";

/** A cart bigger than this is almost certainly an accident (or abuse). */
export const CART_MAX_ITEMS = 12;

export interface CartLine {
  /** `tutor_services.id` — the identity of one tutor + one course. */
  tutorServiceId: string;
  /** `tutor_profiles.id`. */
  tutorProfileId: string;
  tutorName: string;
  /** The tutor's shareable profile code, when they have one. */
  tutorCode: string | null;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  /** The format this line will be bought in. */
  mode: SessionMode;
  /** Per student, per semester, in whole cedis. Null = not offered. */
  priceOneOnOne: number | null;
  priceGroup: number | null;
}

/** The fee for a line in a given format (defaults to the line's own). */
export function cartLinePrice(
  line: Pick<CartLine, "mode" | "priceOneOnOne" | "priceGroup">,
  mode: SessionMode = line.mode,
): number | null {
  return mode === "group" ? line.priceGroup : line.priceOneOnOne;
}

/** The formats this line can be bought in, one-on-one first. */
export function cartLineModes(
  line: Pick<CartLine, "priceOneOnOne" | "priceGroup">,
): SessionMode[] {
  const modes: SessionMode[] = [];
  if (line.priceOneOnOne !== null) modes.push("one_on_one");
  if (line.priceGroup !== null) modes.push("group");
  return modes;
}

/** A line's contribution to the cart subtotal, in pesewas. */
export function cartLinePesewas(line: CartLine): bigint {
  const price = cartLinePrice(line);
  if (price === null || price <= 0) return BigInt(0);
  return BigInt(Math.round(price * 100));
}

/** The whole cart's NET total, in pesewas (before Paystack's fee). */
export function cartSubtotalPesewas(lines: readonly CartLine[]): bigint {
  return lines.reduce((total, line) => total + cartLinePesewas(line), BigInt(0));
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function price(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

/**
 * Validate whatever came out of `localStorage`. Bad entries are DROPPED, not
 * thrown over: a corrupt cart must never break the page (the student can
 * always add the course again). Duplicate services keep the newest entry, so
 * re-adding a course in a different format replaces the old line.
 */
export function normalizeCartLines(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];

  const byService = new Map<string, CartLine>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;

    const tutorServiceId = text(row.tutorServiceId);
    const tutorProfileId = text(row.tutorProfileId);
    const courseId = text(row.courseId);
    const courseName = text(row.courseName);
    if (!tutorServiceId || !tutorProfileId || !courseId || !courseName) continue;

    const oneOnOne = price(row.priceOneOnOne);
    const group = price(row.priceGroup);
    if (oneOnOne === null && group === null) continue;

    const line: CartLine = {
      tutorServiceId,
      tutorProfileId,
      tutorName: text(row.tutorName) ?? "Harcourt tutor",
      tutorCode: text(row.tutorCode),
      courseId,
      courseName,
      courseCode: text(row.courseCode),
      mode: normalizeSessionMode(row.mode),
      priceOneOnOne: oneOnOne,
      priceGroup: group,
    };

    // A line whose chosen format is not offered would be unpriceable at
    // checkout — move it to a format that exists.
    if (cartLinePrice(line) === null) {
      line.mode = oneOnOne !== null ? "one_on_one" : "group";
    }

    // Re-inserting moves the key to the end, so the newest add wins.
    byService.delete(tutorServiceId);
    byService.set(tutorServiceId, line);
  }

  return Array.from(byService.values()).slice(0, CART_MAX_ITEMS);
}

/** Add or replace one line, newest last, capped. */
export function upsertCartLine(
  lines: readonly CartLine[],
  line: CartLine,
): CartLine[] {
  const next = lines.filter((item) => item.tutorServiceId !== line.tutorServiceId);
  next.push(line);
  return next.slice(-CART_MAX_ITEMS);
}

export function removeCartLine(
  lines: readonly CartLine[],
  tutorServiceId: string,
): CartLine[] {
  return lines.filter((item) => item.tutorServiceId !== tutorServiceId);
}

/** The cart's badge count. */
export function cartCount(lines: readonly CartLine[]): number {
  return lines.length;
}
