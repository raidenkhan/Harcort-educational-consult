import { describe, expect, it } from "vitest";
import { summarizeEarnings } from "./summary";

/**
 * The tutor dashboard's "Collected" tile and the Earnings tab must agree.
 * These tests pin the distinction the tiles depend on: collected is money
 * that actually landed (partial instalments included), outstanding ignores
 * cancelled agreements, and the split is 90/10.
 */
function money(status: string, paid: number, remaining: number) {
  return {
    status,
    paidPesewas: BigInt(paid),
    remainingPesewas: BigInt(remaining),
  };
}

describe("summarizeEarnings", () => {
  it("sums what was actually paid, not what was agreed", () => {
    const summary = summarizeEarnings([
      money("active", 60000, 60000),
      money("pending_payment", 0, 80000),
    ]);

    expect(summary.collected).toBe(BigInt(60000));
    expect(summary.outstanding).toBe(BigInt(140000));
  });

  it("splits collected money 90/10", () => {
    const summary = summarizeEarnings([money("completed", 125000, 0)]);

    expect(summary.platformFee).toBe(BigInt(12500));
    expect(summary.tutorShare).toBe(BigInt(112500));
  });

  it("stops counting outstanding money on cancelled agreements", () => {
    const summary = summarizeEarnings([money("cancelled", 40000, 40000)]);

    // Money already collected stays collected; the rest is not owed.
    expect(summary.collected).toBe(BigInt(40000));
    expect(summary.outstanding).toBe(BigInt(0));
  });

  it("returns zeroes for a tutor with no agreements", () => {
    expect(summarizeEarnings([])).toEqual({
      collected: BigInt(0),
      outstanding: BigInt(0),
      platformFee: BigInt(0),
      tutorShare: BigInt(0),
    });
  });

  it("truncates a fraction of a pesewa rather than inventing one", () => {
    // 10% of 999 pesewas is 99.9 — the fee must stay integer pesewas.
    const summary = summarizeEarnings([money("active", 999, 0)]);

    expect(summary.platformFee).toBe(BigInt(99));
    expect(summary.tutorShare).toBe(BigInt(900));
  });
});
