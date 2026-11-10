import { describe, expect, it } from "vitest";
import { paystackCheckoutMessage } from "./paystackMessage";

describe("paystackCheckoutMessage", () => {
  it("explains a rejected email and names it", () => {
    const msg = paystackCheckoutMessage(
      "Paystack /transaction/initialize failed: Invalid Email Address Passed",
      "test.student@harcourt.test",
    );
    expect(msg).toContain("email address on your account (test.student@harcourt.test)");
    expect(msg).toContain("contact the Harcourt team");
    expect(msg).not.toMatch(/transaction\/initialize/);
  });

  it("covers amount and currency refusals", () => {
    expect(paystackCheckoutMessage("Invalid amount")).toMatch(/amount/);
    expect(paystackCheckoutMessage("Currency not supported by merchant")).toMatch(/currency/);
  });

  it("falls back to a plain sentence that never leaks the raw text", () => {
    const msg = paystackCheckoutMessage("Paystack /transaction/initialize failed: Something odd");
    expect(msg).toMatch(/Nothing has been charged/);
    expect(msg).not.toMatch(/Something odd/);
  });
});
