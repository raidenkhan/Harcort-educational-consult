import { describe, expect, it } from "vitest";
import { createThrottle } from "./throttle";

/** Deterministic fake clock. */
function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("sign-in throttle", () => {
  it("allows attempts below the threshold", () => {
    const clock = fakeClock();
    const throttle = createThrottle({ maxAttempts: 5, windowMs: 60_000 }, clock.now);

    for (let i = 0; i < 4; i++) {
      throttle.recordFailure("email:a@b.com");
      expect(throttle.isThrottled("email:a@b.com")).toBe(false);
    }
  });

  it("locks the key after max attempts", () => {
    const clock = fakeClock();
    const throttle = createThrottle({ maxAttempts: 5, windowMs: 60_000 }, clock.now);

    for (let i = 0; i < 5; i++) throttle.recordFailure("email:a@b.com");
    expect(throttle.isThrottled("email:a@b.com")).toBe(true);
  });

  it("unlocks once the window elapses (lazy expiry)", () => {
    const clock = fakeClock();
    const throttle = createThrottle({ maxAttempts: 2, windowMs: 60_000 }, clock.now);

    throttle.recordFailure("ip:1.2.3.4");
    throttle.recordFailure("ip:1.2.3.4");
    expect(throttle.isThrottled("ip:1.2.3.4")).toBe(true);

    clock.advance(60_001);
    expect(throttle.isThrottled("ip:1.2.3.4")).toBe(false);
  });

  it("tracks keys independently (email vs ip)", () => {
    const clock = fakeClock();
    const throttle = createThrottle({ maxAttempts: 3, windowMs: 60_000 }, clock.now);

    for (let i = 0; i < 3; i++) throttle.recordFailure("email:x@y.com");
    expect(throttle.isThrottled("email:x@y.com")).toBe(true);
    expect(throttle.isThrottled("ip:9.9.9.9")).toBe(false);
  });

  it("clear() resets a key (used on successful sign-in)", () => {
    const clock = fakeClock();
    const throttle = createThrottle({ maxAttempts: 1, windowMs: 60_000 }, clock.now);

    throttle.recordFailure("email:a@b.com");
    throttle.clear("email:a@b.com");
    expect(throttle.isThrottled("email:a@b.com")).toBe(false);
  });

  it("prune() drops expired records so keys reset immediately", () => {
    const clock = fakeClock();
    const throttle = createThrottle({ maxAttempts: 1, windowMs: 60_000 }, clock.now);

    throttle.recordFailure("email:a@b.com");
    clock.advance(60_001);
    throttle.prune();
    expect(throttle.isThrottled("email:a@b.com")).toBe(false);
  });
});
