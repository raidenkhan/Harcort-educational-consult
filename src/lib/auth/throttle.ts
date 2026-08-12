/**
 * Brute-force sign-in throttle — pure, so it's unit-testable with an
 * injected clock. In-memory is fine for a single Node instance; swap for a
 * DB/Redis-backed limiter when the app runs on multiple instances.
 */

export interface ThrottleOptions {
  maxAttempts?: number;
  windowMs?: number;
}

export interface Throttle {
  /** Drop expired records (call periodically, or rely on lazy checks). */
  prune(): void;
  isThrottled(key: string): boolean;
  recordFailure(key: string): void;
  clear(key: string): void;
}

export function createThrottle(
  options: ThrottleOptions = {},
  now: () => number = Date.now,
): Throttle {
  const maxAttempts = options.maxAttempts ?? 5;
  const windowMs = options.windowMs ?? 15 * 60 * 1000;

  interface AttemptRecord {
    count: number;
    resetAt: number;
  }

  const failedAttempts = new Map<string, AttemptRecord>();

  function prune() {
    const t = now();
    for (const [key, record] of failedAttempts) {
      if (t > record.resetAt) failedAttempts.delete(key);
    }
  }

  function isThrottled(key: string): boolean {
    const record = failedAttempts.get(key);
    if (!record) return false;
    if (now() > record.resetAt) {
      failedAttempts.delete(key);
      return false;
    }
    return record.count >= maxAttempts;
  }

  function recordFailure(key: string) {
    const t = now();
    const record = failedAttempts.get(key);
    if (!record || t > record.resetAt) {
      failedAttempts.set(key, { count: 1, resetAt: t + windowMs });
    } else {
      record.count += 1;
    }
  }

  function clear(key: string) {
    failedAttempts.delete(key);
  }

  return { prune, isThrottled, recordFailure, clear };
}
