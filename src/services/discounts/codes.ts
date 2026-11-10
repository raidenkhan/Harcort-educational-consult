/**
 * Discount-code rules (pure, unit-tested). Shared by the admin generator,
 * the student's "Apply" check and checkout, so all three agree on the code
 * format and the maths.
 */

/** No 0/O or 1/I/L — a code read aloud or typed from a phone can't be
 *  mistyped into another valid-looking code. 31 symbols. */
const RANDOM_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const RANDOM_LENGTH = 6;

/** Upper-case, no spaces — how codes are stored and compared. */
export function normalizeDiscountCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().replace(/\s+/g, "").toUpperCase() : "";
}

/** Letters, digits and dashes, 4–40 long (matches the DB check). */
export function isValidDiscountCode(code: string): boolean {
  return /^[A-Z0-9-]{4,40}$/.test(code);
}

/** "Mechanical Engineering" → "ME"; "Computer Science" → "CS"; one word →
 *  its first three letters. Letters only, at most 4. */
export function programmeInitials(programme: string | null | undefined): string {
  const words = (programme ?? "")
    .replace(/&/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ""))
    .filter((w) => w.length > 0 && !/^(and|of|the)$/i.test(w));
  if (words.length === 0) return "GEN";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 4).toUpperCase();
}

/** First name's letters, up to 4 ("Ama" → "AMA", "Benjamin" → "BENJ"). */
export function namePart(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const letters = first.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
  return letters || "STU";
}

/**
 * A personal code built from the student's name, programme and year plus a
 * random block: "AMA-ME2-K7QX9P". The readable part tells the admin team
 * whose code it is; the 6-symbol random block (31^6 ≈ 887 million
 * combinations, from a crypto RNG) is what makes it impossible to guess —
 * and the code only works for that one student anyway.
 *
 * `randomBytes` is injectable so tests are deterministic; by default it uses
 * the Web Crypto API (available in browsers and Node).
 */
export function generateDiscountCode(
  student: { name: string | null; programme: string | null; year: number | null },
  randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const year = student.year ?? new Date().getUTCFullYear() % 100;
  // Rejection sampling: only bytes below 248 (= 8 × 31) map evenly onto the
  // 31-symbol alphabet, so no symbol is more likely than another.
  let random = "";
  while (random.length < RANDOM_LENGTH) {
    for (const byte of randomBytes(RANDOM_LENGTH * 2)) {
      if (byte < 248 && random.length < RANDOM_LENGTH) {
        random += RANDOM_ALPHABET[byte % RANDOM_ALPHABET.length];
      }
    }
  }
  return `${namePart(student.name)}-${programmeInitials(student.programme)}${year}-${random}`;
}

/** The discount on one amount, in pesewas, rounded to the nearest pesewa. */
export function discountOn(amountPesewas: bigint, percent: number): bigint {
  const p = BigInt(Math.max(0, Math.min(100, Math.round(percent))));
  return (amountPesewas * p + BigInt(50)) / BigInt(100);
}

export type DiscountCheck =
  | { ok: true; percent: number }
  | { ok: false; reason: "not_found" | "not_yours" | "used" | "revoked" | "expired" };

/** Can this student use this code right now? (The checkout re-runs this.) */
export function checkDiscountEligibility(
  row: { student_id: string; status: string; percent: number; expires_at: string | null } | null,
  studentId: string,
  now: number,
  /** True when an APPLIED redemption already exists for the code. */
  alreadyApplied = false,
): DiscountCheck {
  if (!row) return { ok: false, reason: "not_found" };
  if (row.student_id !== studentId) return { ok: false, reason: "not_yours" };
  if (row.status === "revoked") return { ok: false, reason: "revoked" };
  if (row.status === "used" || alreadyApplied) return { ok: false, reason: "used" };
  if (row.expires_at && Date.parse(row.expires_at) < now) return { ok: false, reason: "expired" };
  return { ok: true, percent: row.percent };
}

export function discountReasonMessage(reason: Exclude<DiscountCheck, { ok: true }>["reason"]): string {
  switch (reason) {
    case "not_found":
    case "not_yours":
      // Same message for both: never confirm that someone else's code exists.
      return "That discount code isn't valid.";
    case "used":
      return "That discount code has already been used.";
    case "revoked":
      return "That discount code is no longer active.";
    case "expired":
      return "That discount code has expired.";
  }
}
