import { describe, expect, it } from "vitest";
import { isMissingColumn } from "./postgres";

describe("isMissingColumn", () => {
  it("recognises Postgres' undefined_column code", () => {
    expect(
      isMissingColumn({
        code: "42703",
        message: 'column tutor_profiles.rate_per_semester does not exist',
      }),
    ).toBe(true);
  });

  it("recognises PostgREST's unknown-column code", () => {
    expect(
      isMissingColumn({
        code: "PGRST204",
        message: "Could not find the 'rate_per_semester' column",
      }),
    ).toBe(true);
  });

  it("recognises the message on its own", () => {
    expect(
      isMissingColumn({
        code: null,
        message: 'column "rate_per_semester" does not exist',
      }),
    ).toBe(true);
  });

  it("does not claim a real write failure", () => {
    expect(
      isMissingColumn({
        code: "23505",
        message: "duplicate key value violates unique constraint",
      }),
    ).toBe(false);
    expect(
      isMissingColumn({ code: null, message: "Rate cannot be negative" }),
    ).toBe(false);
  });
});
