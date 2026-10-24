import { describe, expect, it } from "vitest";
import {
  GHANA_PAYSTACK_FEE,
  checkoutTotal,
  paystackFeeConfig,
  type PaystackFeeConfig,
} from "./fees";

const ghana: PaystackFeeConfig = GHANA_PAYSTACK_FEE;

describe("checkoutTotal", () => {
  it("grosses up so the merchant nets the course fee after 1.95%", () => {
    const result = checkoutTotal(10000, ghana); // GH₵100.00
    expect(result.netPesewas).toBe(BigInt(10000));
    expect(result.totalPesewas).toBe(BigInt(10200));
    expect(result.feePesewas).toBe(BigInt(200));
  });

  it("covers Paystack's fee on the gross, not on the net", () => {
    // The trap: 1.95% of GH₵100 is GH₵1.95, but Paystack charges 1.95% of
    // what it collects (GH₵102), so charging 101.95 would still leave the
    // merchant short. The student must pay the fee on the fee.
    const { totalPesewas, netPesewas, feePesewas } = checkoutTotal(10000, ghana);
    expect(totalPesewas - netPesewas).toBe(feePesewas);
    expect(feePesewas).toBeGreaterThan(BigInt(195));
    expect(Number(totalPesewas) * 0.0195).toBeLessThanOrEqual(Number(feePesewas));
  });

  it("works on a real Harcourt quote (GH₵60)", () => {
    expect(checkoutTotal(6000, ghana)).toEqual({
      netPesewas: BigInt(6000),
      feePesewas: BigInt(121),
      totalPesewas: BigInt(6121),
    });
  });

  it("adds a configured flat fee", () => {
    const result = checkoutTotal(10000, { ...ghana, fixedPesewas: 50 });
    expect(result.totalPesewas).toBe(BigInt(10251));
    expect(result.feePesewas).toBe(BigInt(251));
  });

  it("never passes on more than the configured cap", () => {
    const result = checkoutTotal(10000, { ...ghana, capPesewas: 100 });
    expect(result.feePesewas).toBe(BigInt(100));
    expect(result.totalPesewas).toBe(BigInt(10100));
  });

  it("charges nothing extra when pass-through is disabled", () => {
    expect(checkoutTotal(10000, { ...ghana, enabled: false })).toEqual({
      netPesewas: BigInt(10000),
      feePesewas: BigInt(0),
      totalPesewas: BigInt(10000),
    });
  });

  it("invents no fee at 0% with no flat component", () => {
    expect(
      checkoutTotal(10000, { ...ghana, percent: 0, fixedPesewas: 0 }),
    ).toEqual({
      netPesewas: BigInt(10000),
      feePesewas: BigInt(0),
      totalPesewas: BigInt(10000),
    });
  });

  it("returns zero for a non-positive amount", () => {
    expect(checkoutTotal(0, ghana).totalPesewas).toBe(BigInt(0));
    expect(checkoutTotal(-500, ghana).feePesewas).toBe(BigInt(0));
  });

  it("accepts bigint input (the app's money type)", () => {
    expect(checkoutTotal(BigInt(25000), ghana).totalPesewas).toBe(BigInt(25499));
  });
});

describe("paystackFeeConfig", () => {
  it("defaults to Paystack Ghana's published schedule", () => {
    expect(paystackFeeConfig({})).toEqual({
      enabled: true,
      percent: 1.95,
      fixedPesewas: 0,
      capPesewas: null,
    });
  });

  it("honours every override", () => {
    expect(
      paystackFeeConfig({
        PAYSTACK_FEE_PASSTHROUGH: "0",
        PAYSTACK_FEE_PERCENT: "2.5",
        PAYSTACK_FEE_FIXED_PESEWAS: "50",
        PAYSTACK_FEE_CAP_PESEWAS: "500",
      }),
    ).toEqual({
      enabled: false,
      percent: 2.5,
      fixedPesewas: 50,
      capPesewas: 500,
    });
  });

  it("treats false-ish flags as disabled", () => {
    for (const flag of ["0", "false", "off", "no", "FALSE"]) {
      expect(paystackFeeConfig({ PAYSTACK_FEE_PASSTHROUGH: flag }).enabled).toBe(
        false,
      );
    }
    expect(paystackFeeConfig({ PAYSTACK_FEE_PASSTHROUGH: "1" }).enabled).toBe(
      true,
    );
  });

  it("falls back to the defaults for nonsense values", () => {
    const config = paystackFeeConfig({
      PAYSTACK_FEE_PERCENT: "abc",
      PAYSTACK_FEE_FIXED_PESEWAS: "-10",
      PAYSTACK_FEE_CAP_PESEWAS: "0",
    });
    expect(config.percent).toBe(1.95);
    expect(config.fixedPesewas).toBe(0);
    expect(config.capPesewas).toBeNull();
  });
});
