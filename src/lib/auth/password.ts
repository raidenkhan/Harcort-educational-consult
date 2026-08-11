import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/**
 * Password hashing using Node's built-in scrypt — a NIST-grade KDF with no
 * native dependencies. Stored format: `scrypt$<saltHex>$<hashHex>`.
 * Salt is 16 random bytes; hash is 64 bytes.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

/**
 * Constant-time verification of a password against a stored hash.
 * Returns false for malformed hashes (never throws).
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, salt, expectedHex] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const derivedKey = await scryptAsync(password, salt, expected.length || KEY_LENGTH);
  return (
    derivedKey.length === expected.length && timingSafeEqual(derivedKey, expected)
  );
}
