import { describe, expect, it } from "vitest";
import { cedisToPesewas, formatGhs, pesewasToCedis } from "@/lib/money";

describe("money helpers", () => {
  it("converts cedis to pesewas exactly", () => {
    expect(cedisToPesewas(1250)).toBe(BigInt(125000));
    expect(cedisToPesewas(0)).toBe(BigInt(0));
    expect(cedisToPesewas(0.01)).toBe(BigInt(1));
  });

  it("rounds float artifacts safely", () => {
    // 0.1 + 0.2 style artifacts must never leak into the integer value.
    expect(cedisToPesewas(19.99)).toBe(BigInt(1999));
    expect(cedisToPesewas(104.2)).toBe(BigInt(10420));
  });

  it("converts pesewas back to cedis losslessly", () => {
    expect(pesewasToCedis(BigInt(125000))).toBe(1250);
    expect(pesewasToCedis(BigInt(1))).toBe(0.01);
  });

  it("formats pesewas as GH₵ display strings", () => {
    expect(formatGhs(BigInt(125000))).toBe("GH₵1,250.00");
    expect(formatGhs(BigInt(5))).toBe("GH₵0.05");
  });
});
