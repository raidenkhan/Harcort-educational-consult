import { formatGhs, cedisToPesewas } from "@/lib/money";
import {
  hasSplitPricing,
  offeredModes,
  servicePrice,
  type PricedService,
} from "@/services/tutors/pricing";
import type { SessionMode } from "@/services/auth/sessionFormat";

/**
 * How a course offering's price reads (0031).
 *
 * A tutor may quote one fee per format — or only one of the two. Rendering
 * just `price` (as the app did before 0031) either hides the group rate or
 * shows a number that does not apply to the format the student picked. This
 * is the single place that turns a `tutor_services` row into words, so the
 * card, the profile page and the tutor's own dashboard always agree.
 *
 * Deliberately dependency-free of "use client": server pages and client
 * components both render it.
 */

const MODE_LABEL: Record<SessionMode, string> = {
  one_on_one: "one-on-one",
  group: "group",
};

/** "GH₵400" — whole cedis, matching every other price tag in the app. */
export function priceTag(amount: number): string {
  return `GH₵${amount.toLocaleString()}`;
}

/** The amount for one format, as a tag, or null when that format is not
 *  offered. */
export function modePriceTag(
  service: PricedService,
  mode: SessionMode,
): string | null {
  const amount = servicePrice(service, mode);
  return amount === null ? null : priceTag(amount);
}

/**
 * One-line summary for a `<option>` or a compact row:
 *   "GH₵400 one-on-one · GH₵150 group"
 * Falls back to "Price on request" for a row with no usable price.
 */
export function servicePriceSummary(service: PricedService): string {
  const parts = offeredModes(service)
    .map((mode) => {
      const amount = servicePrice(service, mode);
      return amount === null ? null : `${priceTag(amount)} ${MODE_LABEL[mode]}`;
    })
    .filter((part): part is string => part !== null);

  return parts.length ? parts.join(" · ") : "Price on request";
}

/**
 * The price line for a course card / profile row.
 *
 * `showModeLabels={false}` keeps the card tight ("GH₵400 · GH₵150") for
 * places that already say which formats exist; the profile page keeps the
 * labels because that is where the student decides what to request.
 */
export function ServicePrice({
  service,
  showModeLabels = true,
  className,
}: {
  service: PricedService;
  showModeLabels?: boolean;
  className?: string;
}) {
  // A pre-0031 row has ONE price that applies to both formats. Printing it
  // twice ("GH₵400 one-on-one · GH₵400 group") would suggest the tutor made a
  // choice they never made, so it reads as a single semester fee.
  if (!hasSplitPricing(service)) {
    const legacy = servicePrice(service, "one_on_one");
    return (
      <span className={className}>
        {legacy === null ? "Price on request" : priceTag(legacy)}
        <span className="font-normal text-slate-400"> /semester</span>
      </span>
    );
  }

  const parts = offeredModes(service)
    .map((mode) => {
      const amount = servicePrice(service, mode);
      if (amount === null) return null;
      return showModeLabels
        ? `${priceTag(amount)} ${MODE_LABEL[mode]}`
        : priceTag(amount);
    })
    .filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return <span className={className}>Price on request</span>;
  }

  return (
    <span className={className}>
      {parts.join(" · ")}
      <span className="font-normal text-slate-400"> /semester</span>
    </span>
  );
}

/** True when the tutor quotes different fees for the two formats — used to
 *  decide whether a card needs to explain the split. */
export function hasDistinctFormatPrices(service: PricedService): boolean {
  const oneOnOne = servicePrice(service, "one_on_one");
  const group = servicePrice(service, "group");
  return oneOnOne !== null && group !== null && oneOnOne !== group;
}

/** The paywall/dashboard label for a stored amount in cedis. */
export function cedisTag(amount: number): string {
  return formatGhs(cedisToPesewas(amount));
}
