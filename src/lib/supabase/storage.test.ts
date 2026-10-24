import { beforeEach, describe, expect, it } from "vitest";
import {
  TUTOR_AVATAR_BUCKET,
  isTutorAvatarUrl,
  tutorAvatarPathFromUrl,
  tutorAvatarPublicUrl,
} from "./storage";

const BASE = "https://abc123.supabase.co";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
});

describe("tutorAvatarPublicUrl", () => {
  it("composes the public bucket URL", () => {
    expect(tutorAvatarPublicUrl("avatars/x.webp")).toBe(
      `${BASE}/storage/v1/object/public/${TUTOR_AVATAR_BUCKET}/avatars/x.webp`,
    );
  });
});

describe("isTutorAvatarUrl", () => {
  it("accepts only our own bucket URLs", () => {
    expect(
      isTutorAvatarUrl(`${BASE}/storage/v1/object/public/${TUTOR_AVATAR_BUCKET}/avatars/a.webp`),
    ).toBe(true);
  });

  it("rejects a Google avatar URL and null", () => {
    expect(isTutorAvatarUrl("https://lh3.googleusercontent.com/abc")).toBe(false);
    expect(isTutorAvatarUrl(null)).toBe(false);
    expect(isTutorAvatarUrl(undefined)).toBe(false);
  });

  it("rejects everything when the Supabase URL is unset", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    expect(
      isTutorAvatarUrl(`${BASE}/storage/v1/object/public/${TUTOR_AVATAR_BUCKET}/a.webp`),
    ).toBe(false);
  });
});

describe("tutorAvatarPathFromUrl", () => {
  it("strips the bucket prefix off a valid URL", () => {
    expect(
      tutorAvatarPathFromUrl(
        `${BASE}/storage/v1/object/public/${TUTOR_AVATAR_BUCKET}/avatars/a.webp`,
      ),
    ).toBe("avatars/a.webp");
  });

  it("returns null for foreign or missing URLs", () => {
    expect(tutorAvatarPathFromUrl("https://lh3.googleusercontent.com/abc")).toBeNull();
    expect(tutorAvatarPathFromUrl(null)).toBeNull();
  });
});
