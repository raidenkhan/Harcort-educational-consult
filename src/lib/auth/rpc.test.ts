import { describe, expect, it } from "vitest";
import { isUnknownFunction } from "./rpc";

describe("isUnknownFunction", () => {
  it("recognizes the Postgres undefined_function code", () => {
    expect(
      isUnknownFunction({
        code: "42883",
        message: 'function public.register_user(...) does not exist',
      }),
    ).toBe(true);
  });

  it("recognizes PostgREST's schema-cache miss", () => {
    expect(
      isUnknownFunction({
        code: "PGRST202",
        message:
          "Could not find the function public.register_user(p_session_mode) in the schema cache",
      }),
    ).toBe(true);
  });

  it("recognizes the message alone, with no code", () => {
    expect(
      isUnknownFunction({
        code: null,
        message:
          "Could not find the function public.register_user(p_email, p_password_hash, p_full_name, p_role, p_session_mode) in the schema cache",
      }),
    ).toBe(true);
    expect(
      isUnknownFunction({
        message: 'function "register_user" does not exist',
      }),
    ).toBe(true);
  });

  it("does not swallow real failures", () => {
    // Duplicate email — the caller must report this, not retry the old RPC.
    expect(
      isUnknownFunction({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "credentials_email_key"',
      }),
    ).toBe(false);
    expect(
      isUnknownFunction({
        code: "PGRST301",
        message: "JWT expired",
      }),
    ).toBe(false);
    expect(
      isUnknownFunction({ code: null, message: "column session_mode does not exist" }),
    ).toBe(false);
  });
});
