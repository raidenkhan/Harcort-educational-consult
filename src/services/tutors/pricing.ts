import {
  normalizeSessionMode,
  type SessionMode,
} from "@/services/auth/sessionFormat";

/**
 * Per-format course pricing (0031).
 *
 * A `tutor_services` row quotes a fee for a course in each session format:
 * `price_group` and `price_one_on_one`, both nullable. NULL means the tutor
 * does not offer that course in that format — the request UI hides the
 * format and the paywall refuses it, rather than quietly charging the other
 * price.
 *
 * Kept pure and unit-tested because this decides what a student is charged.
 */

/** The pricing fields of a `tutor_services` row, in any state of migration. */
export interface PricedService {
  /** Legacy single price (pre-0031). */
  price?: unknown;
  /** Per-format prices. Absent entirely until 0031 is applied. */
  price_group?: unknown;
  price_one_on_one?: unknown;
}

/** A usable money amount, or null. Rejects negatives, NaN and blank strings —
 *  a malformed price must never become a GH₵0 charge. */
function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}

/**
 * Does this row carry per-format pricing at all?
 *
 * This is the migration discriminator. Before 0031 the columns do not exist,
 * so a `select("*")` (or a mapper given a raw row) yields `undefined` for
 * both; after 0031 they are present, and `null` genuinely means "not
 * offered". Checking `=== undefined` rather than falsiness is what keeps
 * those two cases apart.
 */
export function hasSplitPricing(service: PricedService): boolean {
  return (
    service.price_group !== undefined || service.price_one_on_one !== undefined
  );
}

/**
 * The fee for one student in the given format, or null when the tutor does
 * not offer that format for this course.
 *
 * Legacy rows (pre-0031) have one price and no format, so it applies to both.
 */
export function servicePrice(
  service: PricedService,
  mode: unknown,
): number | null {
  const format = normalizeSessionMode(mode);

  if (!hasSplitPricing(service)) return toAmount(service.price);

  return toAmount(
    format === "group" ? service.price_group : service.price_one_on_one,
  );
}

/** Whether the tutor offers this course in that format (i.e. has a price). */
export function offersMode(service: PricedService, mode: unknown): boolean {
  return servicePrice(service, mode) !== null;
}

/**
 * The formats this offering can actually be requested in, one-on-one first —
 * the default order the UI lists them in.
 */
export function offeredModes(service: PricedService): SessionMode[] {
  return (["one_on_one", "group"] as const).filter((mode) =>
    offersMode(service, mode),
  );
}

/**
 * Cheapest fee across the formats the tutor offers, for "from GH₵…" summaries.
 * Null when the row has no usable price at all (a broken row — the DB check in
 * 0031 is meant to make that impossible).
 */
export function lowestPrice(service: PricedService): number | null {
  const prices = offeredModes(service)
    .map((mode) => servicePrice(service, mode))
    .filter((amount): amount is number => amount !== null);
  return prices.length ? Math.min(...prices) : null;
}

/** One offering, priced per format — the shape the request UI consumes. */
export interface FormatPrices {
  oneOnOne: number | null;
  group: number | null;
  /** Cheapest offered fee, for "from GH₵…" labels. */
  from: number | null;
}

/**
 * Both format prices at once. Callers need all three values together (the
 * course label shows "from", the format picker disables what is null), so
 * reading them separately would re-run the legacy fallback three times.
 */
export function formatPrices(service: PricedService): FormatPrices {
  const oneOnOne = servicePrice(service, "one_on_one");
  const group = servicePrice(service, "group");
  const offered = [oneOnOne, group].filter(
    (amount): amount is number => amount !== null,
  );
  return {
    oneOnOne,
    group,
    from: offered.length ? Math.min(...offered) : null,
  };
}
