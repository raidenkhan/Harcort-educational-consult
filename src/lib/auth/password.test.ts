import { describe, expect, it } from "vitest";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";

describe("password hashing (scrypt)", () => {
  it("round-trips: a freshly hashed password verifies", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$")).toBe(true);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("right-password");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("produces a unique salt per hash (same password, different hashes)", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password"), hashPassword("same-password")]);
    expect(a).not.toBe(b);
    await expect(verifyPassword("same-password", a)).resolves.toBe(true);
    await expect(verifyPassword("same-password", b)).resolves.toBe(true);
  });

  it("returns false for malformed stored hashes instead of throwing", async () => {
    await expect(verifyPassword("anything", "")).resolves.toBe(false);
    await expect(verifyPassword("anything", "plain-text")).resolves.toBe(false);
    await expect(verifyPassword("anything", "scrypt$onlysalt")).resolves.toBe(false);
    await expect(verifyPassword("anything", "bcrypt$salt$hash")).resolves.toBe(false);
  });
});

describe("DUMMY_HASH", () => {
  it("is well-formed so verifyPassword runs scrypt instead of bailing early", () => {
    const parts = DUMMY_HASH.split("$");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[2]).toMatch(/^[0-9a-f]{128}$/);
  });

  it("never actually verifies a password", async () => {
    await expect(verifyPassword("anything", DUMMY_HASH)).resolves.toBe(false);
  });
});
