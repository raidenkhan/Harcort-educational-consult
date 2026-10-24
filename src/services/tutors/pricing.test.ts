import { describe, expect, it } from "vitest";
import {
  hasSplitPricing,
  lowestPrice,
  offeredModes,
  offersMode,
  servicePrice,
} from "./pricing";

/**
 * The distinction these tests exist to protect: a NULL per-format price means
 * "not offered", while an ABSENT column means "this database predates 0031,
 * use the single price". Collapsing the two either hides a format the tutor
 * offers or silently charges the wrong fee.
 */
describe("servicePrice", () => {
  it("charges the format-specific price", () => {
    const service = { price: 0, price_group: 150, price_one_on_one: 400 };
    expect(servicePrice(service, "group")).toBe(150);
    expect(servicePrice(service, "one_on_one")).toBe(400);
  });

  it("treats a null format price as NOT offered, even when the other is set", () => {
    const groupOnly = { price: 150, price_group: 150, price_one_on_one: null };
    expect(servicePrice(groupOnly, "group")).toBe(150);
    expect(servicePrice(groupOnly, "one_on_one")).toBeNull();
    expect(offersMode(groupOnly, "one_on_one")).toBe(false);
  });

  it("falls back to the legacy price when the split columns are absent", () => {
    const legacy = { price: 200 };
    expect(hasSplitPricing(legacy)).toBe(false);
    expect(servicePrice(legacy, "group")).toBe(200);
    expect(servicePrice(legacy, "one_on_one")).toBe(200);
  });

  it("does NOT fall back when the columns exist but are null", () => {
    const none = { price: 200, price_group: null, price_one_on_one: null };
    expect(hasSplitPricing(none)).toBe(true);
    expect(servicePrice(none, "group")).toBeNull();
    expect(servicePrice(none, "one_on_one")).toBeNull();
  });

  it("treats an unrecognised mode as one-on-one", () => {
    const service = { price_group: 150, price_one_on_one: 400 };
    expect(servicePrice(service, "nonsense")).toBe(400);
    expect(servicePrice(service, undefined)).toBe(400);
  });

  it("never turns a malformed price into a zero charge", () => {
    expect(servicePrice({ price_group: "abc" }, "group")).toBeNull();
    expect(servicePrice({ price_group: -5 }, "group")).toBeNull();
    expect(servicePrice({ price_group: "" }, "group")).toBeNull();
    expect(servicePrice({ price: null }, "group")).toBeNull();
  });

  it("accepts numeric strings (PostgREST returns numerics as strings)", () => {
    expect(servicePrice({ price_one_on_one: "250.50" }, "one_on_one")).toBe(250.5);
  });

  it("treats a zero price as a real price, not 'not offered'", () => {
    const free = { price_group: 0, price_one_on_one: 300 };
    expect(servicePrice(free, "group")).toBe(0);
    expect(offersMode(free, "group")).toBe(true);
  });
});

describe("offeredModes", () => {
  it("lists one-on-one before group", () => {
    expect(offeredModes({ price_group: 150, price_one_on_one: 400 })).toEqual([
      "one_on_one",
      "group",
    ]);
  });

  it("omits formats with no price", () => {
    expect(offeredModes({ price_group: 150, price_one_on_one: null })).toEqual([
      "group",
    ]);
  });

  it("lists both formats for a legacy row", () => {
    expect(offeredModes({ price: 200 })).toEqual(["one_on_one", "group"]);
  });
});

describe("lowestPrice", () => {
  it("returns the cheaper offered format", () => {
    expect(lowestPrice({ price_group: 150, price_one_on_one: 400 })).toBe(150);
  });

  it("ignores formats that are not offered", () => {
    expect(lowestPrice({ price_group: null, price_one_on_one: 400 })).toBe(400);
  });

  it("returns null when nothing is offered", () => {
    expect(lowestPrice({ price_group: null, price_one_on_one: null })).toBeNull();
  });
});
