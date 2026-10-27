/**
 * Money roll-ups shared by every tutor money surface.
 *
 * Kept free of Supabase imports (pure + unit-tested) so the dashboard tiles and
 * the earnings tab can never disagree about what a tutor has collected.
 * Amounts are BIGINT pesewas, exactly as they cross the query boundary.
 */

/** The shape `summarizeEarnings` needs from an agreement. */
export interface EngagementMoney {
  status: string;
  paidPesewas: bigint;
  remainingPesewas: bigint;
}

/** Harcourt keeps 10% of collected money (the 0011 default). */
export const PLATFORM_FEE_BPS = BigInt(1000);
const BPS_DENOMINATOR = BigInt(10000);

export interface EarningsSummary {
  /** What students have actually paid — not what they owe. */
  collected: bigint;
  /** Still owed on agreements that are not cancelled. */
  outstanding: bigint;
  /** Harcourt's 10% of `collected`. */
  platformFee: bigint;
  /** The tutor's 90% of `collected`. */
  tutorShare: bigint;
}

/**
 * Roll a tutor's agreements into the four numbers the money surfaces show.
 *
 * `collected` includes partial instalment payments (0029 tracks them in
 * `paid_amount`), so it is always the real money in, not the agreed totals.
 * Cancelled agreements stop contributing to what is outstanding — nothing is
 * owed on them any more.
 */
export function summarizeEarnings(
  engagements: ReadonlyArray<EngagementMoney>,
): EarningsSummary {
  let collected = BigInt(0);
  let outstanding = BigInt(0);

  for (const engagement of engagements) {
    collected += engagement.paidPesewas;
    if (engagement.status !== "cancelled") {
      outstanding += engagement.remainingPesewas;
    }
  }

  const platformFee = (collected * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
  return {
    collected,
    outstanding,
    platformFee,
    tutorShare: collected - platformFee,
  };
}
