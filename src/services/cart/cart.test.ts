import { describe, expect, it } from "vitest";
import {
  cartLinePesewas,
  cartSubtotalPesewas,
  clampSemesters,
  normalizeCartLines,
  type CartLine,
} from "./cart";

const line = (overrides: Partial<CartLine> = {}): CartLine => ({
  tutorServiceId: "svc-1",
  tutorProfileId: "tp-1",
  tutorName: "Kofi",
  tutorCode: null,
  courseId: "c-1",
  courseName: "Thermodynamics",
  courseCode: "ME 255",
  mode: "one_on_one",
  priceOneOnOne: 60,
  priceGroup: 40,
  semesters: 1,
  ...overrides,
});

describe("clampSemesters", () => {
  it("keeps whole values inside 1..4", () => {
    expect(clampSemesters(1)).toBe(1);
    expect(clampSemesters(3)).toBe(3);
    expect(clampSemesters(4)).toBe(4);
  });
  it("clamps out-of-range and junk", () => {
    expect(clampSemesters(0)).toBe(1);
    expect(clampSemesters(9)).toBe(4);
    expect(clampSemesters(-2)).toBe(1);
    expect(clampSemesters("2")).toBe(2);
    expect(clampSemesters("abc")).toBe(1);
    expect(clampSemesters(undefined)).toBe(1);
    expect(clampSemesters(2.6)).toBe(3);
  });
});

describe("cartLinePesewas", () => {
  it("is the per-semester price × semesters, in the line's format", () => {
    expect(cartLinePesewas(line())).toBe(BigInt(6000));
    expect(cartLinePesewas(line({ semesters: 3 }))).toBe(BigInt(18000));
    expect(cartLinePesewas(line({ mode: "group", semesters: 2 }))).toBe(BigInt(8000));
  });
  it("is zero for a format the tutor doesn't offer", () => {
    expect(cartLinePesewas(line({ mode: "group", priceGroup: null }))).toBe(BigInt(0));
  });
});

describe("cartSubtotalPesewas", () => {
  it("adds lines with their own semester counts", () => {
    const total = cartSubtotalPesewas([
      line({ semesters: 2 }),
      line({ tutorServiceId: "svc-2", mode: "group", semesters: 1 }),
    ]);
    expect(total).toBe(BigInt(12000 + 4000));
  });
});

describe("normalizeCartLines — semesters", () => {
  it("defaults a pre-semesters cart entry to 1", () => {
    const { semesters: _drop, ...legacy } = line();
    void _drop;
    expect(normalizeCartLines([legacy])[0].semesters).toBe(1);
  });
  it("clamps a tampered value", () => {
    expect(normalizeCartLines([line({ semesters: 40 })])[0].semesters).toBe(4);
  });
});
