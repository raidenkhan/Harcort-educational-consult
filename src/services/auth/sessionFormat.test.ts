import { describe, expect, it } from "vitest";
import {
  DEFAULT_SESSION_MODE,
  normalizeSessionMode,
  sessionModeLabel,
  SESSION_MODES,
} from "./sessionFormat";

describe("normalizeSessionMode", () => {
  it("keeps both stored values", () => {
    expect(normalizeSessionMode("one_on_one")).toBe("one_on_one");
    expect(normalizeSessionMode("group")).toBe("group");
  });

  it("falls back to one-on-one for junk, null and undefined", () => {
    expect(normalizeSessionMode("GROUP")).toBe("one_on_one");
    expect(normalizeSessionMode("")).toBe("one_on_one");
    expect(normalizeSessionMode("duo")).toBe("one_on_one");
    expect(normalizeSessionMode(null)).toBe("one_on_one");
    expect(normalizeSessionMode(undefined)).toBe("one_on_one");
    expect(normalizeSessionMode(2)).toBe("one_on_one");
  });

  it("defaults to the value the DB would have written", () => {
    expect(DEFAULT_SESSION_MODE).toBe("one_on_one");
  });
});

describe("sessionModeLabel", () => {
  it("names both formats", () => {
    expect(sessionModeLabel("one_on_one")).toBe("One-on-one");
    expect(sessionModeLabel("group")).toBe("Group session");
  });

  it("labels an unreadable value as the default rather than blank", () => {
    expect(sessionModeLabel(undefined)).toBe("One-on-one");
  });
});

describe("SESSION_MODES", () => {
  it("is the single source for stored values", () => {
    expect([...SESSION_MODES]).toEqual(["one_on_one", "group"]);
  });
});
