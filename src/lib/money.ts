/**
 * Money helpers — the app stores ALL amounts as integer PESAWAS (1 GHS =
 * 100 pesewas) in BIGINT columns. Never floats, never cedis, anywhere.
 *
 * Pure functions only — unit-testable, usable in server and client
 * components alike.
 */

/** Convert a whole-cedi number (what tutors quote) to pesewas. */
export function cedisToPesewas(cedis: number): bigint {
  return BigInt(Math.round(cedis * 100));
}

/** Pesewas → decimal cedis (e.g. 125000n → 1250). Lossless. */
export function pesewasToCedis(pesewas: bigint): number {
  return Number(pesewas) / 100;
}

/** Format pesewas as a Ghana-cedi display string: 125000n → "GH₵1,250.00". */
export function formatGhs(pesewas: bigint): string {
  const value = pesewasToCedis(pesewas);
  return `GH₵${value.toLocaleString("en-GH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
