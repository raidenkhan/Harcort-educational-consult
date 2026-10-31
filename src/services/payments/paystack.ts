import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack API client — server-only.
 *
 * Every call authenticates with the SECRET key. The public key is only ever
 * used client-side (checkout popup); it lives in NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY.
 *
 * Verify-then-trust: the webhook route NEVER trusts the payload's amount —
 * it re-fetches the transaction from Paystack's verify endpoint and compares
 * against our own expectations before anything is applied.
 */

const PAYSTACK_BASE = "https://api.paystack.co";

/**
 * Hard ceiling on every Paystack call.
 *
 * `fetch` has no default timeout. Without one, a stalled connection to
 * Paystack held the whole server action / webhook / return redirect open
 * until the platform killed the function — which is exactly what "the server
 * is not responding" looks like from the student's side. Fifteen seconds is
 * far longer than a healthy call (usually <1s) and far shorter than any
 * platform limit.
 */
const PAYSTACK_TIMEOUT_MS = 15_000;

/**
 * A rejection Paystack itself answered. This is the ONLY failure that proves
 * a transaction was not created — timeouts and dropped connections leave the
 * outcome unknown, and callers must not treat them as rejections (see
 * `runCheckout`).
 */
export class PaystackApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaystackApiError";
  }
}

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function secretKey(): string {
  // Trimmed and unquoted: a key pasted into a dashboard field often carries a
  // trailing space, a carriage return, or the quotes the user typed around
  // it — and Paystack answers that with a plain signature mismatch that
  // looks exactly like a wrong key.
  const key = (process.env.PAYSTACK_SECRET_KEY ?? "")
    .trim()
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .trim();
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

async function paystackFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PAYSTACK_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(PAYSTACK_TIMEOUT_MS),
    });
  } catch (error) {
    // Deliberately NOT a PaystackApiError: we never saw an answer, so the
    // request may or may not have been processed.
    const name = error instanceof Error ? error.name : "";
    const reason =
      name === "TimeoutError" || name === "AbortError"
        ? `timed out after ${PAYSTACK_TIMEOUT_MS / 1000}s`
        : "is unreachable";
    throw new Error(`Paystack ${path} ${reason}`);
  }

  // A gateway/proxy can answer with HTML. Treat that as unknown too — it says
  // nothing about whether the transaction exists.
  let json: { status: boolean; message?: string; data?: T };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new Error(`Paystack ${path} returned a non-JSON response (${res.status})`);
  }

  if (!res.ok || !json.status) {
    // Paystack answered and said no: definitive.
    throw new PaystackApiError(`Paystack ${path} failed: ${json.message ?? res.status}`);
  }
  if (json.data === undefined) {
    throw new Error(`Paystack ${path} returned no data`);
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// Types (only the fields we consume)
// ---------------------------------------------------------------------------

export interface PaystackTransaction {
  reference: string;
  amount: number; // pesewas (kobo-equivalent subunit)
  currency: string;
  status: string; // "success" | "failed" | "abandoned" | ...
  paid_at?: string;
}

export interface PaystackTransfer {
  transfer_code: string;
  status: string; // "success" | "pending" | "failed" | ...
  amount: number;
}

/**
 * The hosted-checkout handoff. `authorization_url` is the page the student is
 * sent to and `access_code` is its key — both are returned by initialize, and
 * the checkout code needs BOTH (a declared return type without the URL is how
 * the caller ended up casting the response to reach a field Paystack always
 * sends).
 */
export interface PaystackCheckout {
  authorization_url: string;
  access_code: string;
  reference: string;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** Initialize a transaction; returns the hosted checkout URL + access code. */
export function initializeTransaction(opts: {
  email: string;
  amountPesewas: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackCheckout> {
  return paystackFetch("/transaction/initialize", {
    method: "POST",
    body: {
      email: opts.email,
      amount: opts.amountPesewas,
      reference: opts.reference,
      currency: "GHS",
      callback_url: opts.callbackUrl,
      channels: ["mobile_money", "card", "bank_transfer", "ussd"],
      metadata: opts.metadata ?? {},
    },
  });
}

/** Re-fetch a transaction from Paystack — the verify-then-trust step. */
export function verifyTransaction(reference: string): Promise<PaystackTransaction> {
  return paystackFetch<PaystackTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

// ---------------------------------------------------------------------------
// Transfers (tutor payouts)
// ---------------------------------------------------------------------------

/** Create a transfer recipient for a Ghana mobile-money account. */
export function createTransferRecipient(opts: {
  accountName: string;
  phone: string; // local format, e.g. 0241234567
  provider: "mtn" | "telecel" | "airteltigo";
}): Promise<{ recipient_code: string }> {
  // Paystack's Ghana MoMo provider slugs.
  const bankSlug =
    opts.provider === "mtn"
      ? "mtn"
      : opts.provider === "telecel"
        ? "telecel cash"
        : "airtel tigo";

  return paystackFetch("/transferrecipient", {
    method: "POST",
    body: {
      type: "mobile_money",
      name: opts.accountName,
      account_number: opts.phone,
      bank_code: bankSlug,
      currency: "GHS",
    },
  });
}

/** Initiate a transfer (payout) to a recipient. ₵1 fee per MoMo transfer. */
export function initiateTransfer(opts: {
  amountPesewas: number;
  recipientCode: string;
  reason: string;
  /** Our own idempotency/reference code (HRC-PAY-…) — also the key the
   *  requery uses against /transfer/verify (code or reference both work). */
  reference: string;
}): Promise<PaystackTransfer> {
  return paystackFetch("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: opts.amountPesewas,
      recipient: opts.recipientCode,
      reason: opts.reason,
      currency: "GHS",
      reference: opts.reference,
    },
  });
}

/** Fetch one transfer's live status (reconciliation requery). */
export function verifyTransfer(transferCode: string): Promise<PaystackTransfer> {
  return paystackFetch<PaystackTransfer>(
    `/transfer/verify/${encodeURIComponent(transferCode)}`,
  );
}

// ---------------------------------------------------------------------------
// Webhook signature
// ---------------------------------------------------------------------------

/**
 * Verify Paystack's webhook signature: HMAC SHA512 of the RAW body with the
 * secret key, compared in constant time. The raw body must be captured
 * BEFORE any JSON parsing — a re-serialized body has different bytes.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
