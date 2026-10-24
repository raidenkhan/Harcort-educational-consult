/**
 * Paystack processing fees — passed on to the student (0034).
 *
 * Paystack deducts its fee from the money it collects, so a merchant who
 * charges exactly the course fee nets LESS than the course fee. Harcourt's
 * rule is that the student bears the processing cost: checkout charges
 * `course fee + Paystack fee`, Paystack keeps its fee, and the agreement
 * receives exactly the course fee — so tutor earnings, payouts and the 0029
 * amount guards keep working on the net figure.
 *
 * The published Ghana schedule (support.paystack.com → "Transactions
 * pricing") is **1.95% for cards, mobile money and bank transfer, no flat
 * fee, no cap**. That is the default here; the env vars below exist so a
 * pricing change (or a Nigeria-style flat fee) never needs a code change:
 *
 *   PAYSTACK_FEE_PASSTHROUGH=0        absorb the fee (Harcourt pays it)
 *   PAYSTACK_FEE_PERCENT=1.95         percentage component
 *   PAYSTACK_FEE_FIXED_PESEWAS=0      flat component, in pesewas
 *   PAYSTACK_FEE_CAP_PESEWAS=          optional cap on the fee we pass on
 *
 * Pure functions only — unit-tested, usable on the server and in tests. The
 * `process.env` default is read when called, never at import time.
 */

export interface PaystackFeeConfig {
  /** true = the student pays the fee; false = Harcourt absorbs it. */
  enabled: boolean;
  /** Percentage component (Ghana: 1.95). */
  percent: number;
  /** Flat component in pesewas (Ghana: 0; Nigeria: 10000 = NGN 100). */
  fixedPesewas: number;
  /** Optional cap in pesewas on the amount passed to the student. */
  capPesewas: number | null;
}

/** Paystack Ghana's published schedule, used when the env is silent. */
export const GHANA_PAYSTACK_FEE: PaystackFeeConfig = {
  enabled: true,
  percent: 1.95,
  fixedPesewas: 0,
  capPesewas: null,
};

function readNumber(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

/** Read the config from the environment, falling back to Ghana's schedule. */
export function paystackFeeConfig(
  env: Record<string, string | undefined> = process.env,
): PaystackFeeConfig {
  const flag = (env.PAYSTACK_FEE_PASSTHROUGH ?? "").trim().toLowerCase();
  const percent = readNumber(env.PAYSTACK_FEE_PERCENT);
  const fixed = readNumber(env.PAYSTACK_FEE_FIXED_PESEWAS);
  const cap = readNumber(env.PAYSTACK_FEE_CAP_PESEWAS);

  return {
    enabled: !["0", "false", "off", "no"].includes(flag),
    percent:
      percent != null && percent >= 0 && percent < 100
        ? percent
        : GHANA_PAYSTACK_FEE.percent,
    fixedPesewas:
      fixed != null && fixed >= 0
        ? Math.trunc(fixed)
        : GHANA_PAYSTACK_FEE.fixedPesewas,
    capPesewas:
      cap != null && cap > 0 ? Math.trunc(cap) : GHANA_PAYSTACK_FEE.capPesewas,
  };
}

export interface CheckoutTotal {
  /** The money that reaches the agreement (the tutor's quote). */
  netPesewas: bigint;
  /** Paystack's fee, paid by the student on top. */
  feePesewas: bigint;
  /** What the student's card / MoMo is actually charged. */
  totalPesewas: bigint;
}

/**
 * Gross up a course amount so the merchant nets `netPesewas` after Paystack's
 * fee.
 *
 * Paystack's own guide: `total = (price + flat) / (1 - decimal fee)`, plus
 * one pesewa to absorb rounding. We do the same in integer pesewas (no
 * floats), then subtract the net to get the fee the student sees. When a cap
 * is configured and the calculated fee exceeds it, Harcourt absorbs the
 * excess — the student never pays more than the cap.
 *
 * A zero/disabled schedule returns the net unchanged: checkout then behaves
 * exactly as it did before 0034.
 */
export function checkoutTotal(
  net: bigint | number,
  config: PaystackFeeConfig = paystackFeeConfig(),
): CheckoutTotal {
  const netPesewas =
    typeof net === "bigint" ? net : BigInt(Math.round(net));

  if (netPesewas <= BigInt(0) || !config.enabled) {
    return { netPesewas, feePesewas: BigInt(0), totalPesewas: netPesewas };
  }

  const basisPoints = BigInt(Math.round(config.percent * 100));
  const fixed = BigInt(Math.max(0, Math.trunc(config.fixedPesewas)));

  // A 0% / no-flat schedule means there is nothing to pass on. Without this
  // guard the "+1 pesewa rounding cushion" below would invent a fee.
  if (basisPoints === BigInt(0) && fixed === BigInt(0)) {
    return { netPesewas, feePesewas: BigInt(0), totalPesewas: netPesewas };
  }

  const denominator = BigInt(10000) - basisPoints;
  if (denominator <= BigInt(0)) {
    // Nonsense percentage (>= 100%) — never invent a division by zero.
    return { netPesewas, feePesewas: BigInt(0), totalPesewas: netPesewas };
  }

  const ceilDiv = (a: bigint, b: bigint) => (a + b - BigInt(1)) / b;
  let total =
    ceilDiv((netPesewas + fixed) * BigInt(10000), denominator) + BigInt(1);
  let fee = total - netPesewas;

  if (config.capPesewas != null) {
    const cap = BigInt(Math.max(0, Math.trunc(config.capPesewas)));
    if (fee > cap) {
      fee = cap;
      total = netPesewas + fee;
    }
  }

  return { netPesewas, feePesewas: fee, totalPesewas: total };
}
