import { describe, expect, it } from "vitest";
import { readRate } from "./rate";

describe("readRate", () => {
  it("reads the current column name", () => {
    expect(readRate({ rate_per_semester: 500 })).toBe(500);
  });

  it("falls back to the pre-0028 column name", () => {
    expect(readRate({ rate_per_hour: 50 })).toBe(50);
  });

  it("prefers the current column when both are present", () => {
    expect(readRate({ rate_per_semester: 500, rate_per_hour: 50 })).toBe(500);
  });

  it("returns null when neither carries a rate", () => {
    expect(readRate({})).toBeNull();
    expect(readRate({ rate_per_semester: null })).toBeNull();
    expect(readRate(null)).toBeNull();
    expect(readRate(undefined)).toBeNull();
  });

  it("keeps a zero rate (a free course is not the same as no price)", () => {
    expect(readRate({ rate_per_semester: 0 })).toBe(0);
  });
});
