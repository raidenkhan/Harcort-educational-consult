import { describe, expect, it } from "vitest";
import {
  ALLOWED_AVATAR_TYPES,
  MAX_AVATAR_BYTES,
  validateAvatarFile,
} from "./avatarFile";

describe("validateAvatarFile", () => {
  it("accepts a small, allowed image", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: 100_000 })).toBeNull();
    expect(validateAvatarFile({ type: "image/png", size: 1 })).toBeNull();
    expect(validateAvatarFile({ type: "image/webp", size: MAX_AVATAR_BYTES })).toBeNull();
  });

  it("rejects a disallowed type", () => {
    expect(validateAvatarFile({ type: "image/gif", size: 100_000 })).toMatch(
      /JPG, PNG or WebP/i,
    );
    expect(validateAvatarFile({ type: "application/pdf", size: 10 })).toMatch(
      /JPG, PNG or WebP/i,
    );
  });

  it("rejects an oversized file at the boundary", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: MAX_AVATAR_BYTES + 1 })).toMatch(
      /under 2 MB/i,
    );
  });

  it("rejects an empty or missing file", () => {
    expect(validateAvatarFile({ type: "", size: 0 })).toMatch(/choose a photo/i);
    expect(validateAvatarFile({ type: "image/jpeg", size: 0 })).toMatch(
      /choose a photo/i,
    );
  });

  it("exposes the allowlist the upload form advertises", () => {
    expect(ALLOWED_AVATAR_TYPES).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});
