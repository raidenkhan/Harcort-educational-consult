/**
 * Gate for the `router.refresh()` poll used by /chat and /groups.
 *
 * A refresh while a server-action POST is in flight cancels that request, and
 * the cancelled response leaves `useActionState`'s pending flag stuck forever
 * — the "Add selected" spinner that never stops even though the students were
 * added. Polling therefore stands down while a mutation runs.
 *
 * `until` is a safety valve: a mutation that never reports back (a dropped
 * connection, or a plain form action that navigates away) still reopens the
 * gate after `POLL_PAUSE_MS`, so live updates can never be switched off for
 * the rest of the session.
 */
export interface PollGate {
  /** Awaited mutations still running — delays clearing `until` early. */
  locks: number;
  /** Epoch ms the gate reopens (0 = open now). */
  until: number;
}

export const POLL_PAUSE_MS = 20_000;

/**
 * Hold the gate shut for one awaited mutation. The returned release is
 * idempotent, so a `finally` plus a cleanup can both call it safely.
 */
export function pausePolling(
  gate: PollGate,
  now: number = Date.now(),
): () => void {
  gate.locks += 1;
  gate.until = now + POLL_PAUSE_MS;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    gate.locks = Math.max(0, gate.locks - 1);
    // Last holder out clears the deadline, so an awaited action resumes the
    // poll immediately instead of waiting for the safety valve.
    if (gate.locks === 0) gate.until = 0;
  };
}

/**
 * Pause without a handle — for a form action the caller can't await (React
 * `action={fn}`) or that may navigate away. The safety valve reopens it.
 */
export function deferPolling(
  gate: PollGate,
  now: number = Date.now(),
): void {
  gate.until = now + POLL_PAUSE_MS;
}

/** Whether a poll tick must skip right now. */
export function pollingPaused(
  gate: PollGate,
  now: number = Date.now(),
): boolean {
  return now < gate.until;
}
