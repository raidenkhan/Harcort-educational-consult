import { describe, expect, it } from "vitest";
import {
  POLL_PAUSE_MS,
  deferPolling,
  pausePolling,
  pollingPaused,
  type PollGate,
} from "./pollGate";

function freshGate(): PollGate {
  return { locks: 0, until: 0 };
}

describe("poll gate", () => {
  it("is open until something pauses it", () => {
    const gate = freshGate();
    expect(pollingPaused(gate, 1_000)).toBe(false);
  });

  it("holds while a mutation is awaited and reopens on release", () => {
    const gate = freshGate();
    const release = pausePolling(gate, 1_000);

    expect(pollingPaused(gate, 1_000)).toBe(true);

    release();
    // The last holder out clears the deadline, so the next tick may refresh.
    expect(pollingPaused(gate, 1_000)).toBe(false);
  });

  it("keeps holding until every overlapping mutation releases", () => {
    const gate = freshGate();
    const first = pausePolling(gate, 1_000);
    const second = pausePolling(gate, 1_100);

    first();
    expect(pollingPaused(gate, 1_200)).toBe(true);

    second();
    expect(pollingPaused(gate, 1_200)).toBe(false);
  });

  it("ignores a second release from the same handle", () => {
    const gate = freshGate();
    const release = pausePolling(gate, 1_000);

    release();
    release();
    expect(gate.locks).toBe(0);
  });

  it("reopens at the safety valve when the release never runs", () => {
    const gate = freshGate();
    pausePolling(gate, 1_000);

    expect(pollingPaused(gate, 1_000 + POLL_PAUSE_MS - 1)).toBe(true);
    expect(pollingPaused(gate, 1_000 + POLL_PAUSE_MS)).toBe(false);
  });

  it("defers without a lock, for a form action that may navigate away", () => {
    const gate = freshGate();
    deferPolling(gate, 5_000);

    expect(gate.locks).toBe(0);
    expect(pollingPaused(gate, 5_001)).toBe(true);
    expect(pollingPaused(gate, 5_000 + POLL_PAUSE_MS)).toBe(false);
  });
});
