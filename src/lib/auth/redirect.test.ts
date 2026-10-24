import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps a same-site path", () => {
    expect(safeNextPath("/pay/abc123")).toBe("/pay/abc123");
    expect(safeNextPath("/dashboard?payment=return")).toBe(
      "/dashboard?payment=return",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(safeNextPath("  /courses  ")).toBe("/courses");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects control characters that could smuggle a header", () => {
    expect(safeNextPath("/ok\nLocation: https://evil.example")).toBeNull();
  });

  it("rejects empty, non-string and oversized values", () => {
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("   ")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    expect(safeNextPath(`/${"a".repeat(400)}`)?.length).toBe(300);
  });
});
