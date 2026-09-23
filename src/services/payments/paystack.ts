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

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

async function paystackFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const json = (await res.json()) as { status: boolean; message?: string; data?: T };
  if (!res.ok || !json.status) {
    throw new Error(`Paystack ${path} failed: ${json.message ?? res.status}`);
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

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/** Initialize a transaction; returns the checkout access code + reference. */
export function initializeTransaction(opts: {
  email: string;
  amountPesewas: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<{ access_code: string; reference: string }> {
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
}): Promise<PaystackTransfer> {
  return paystackFetch("/transfer", {
    method: "POST",
    body: {
      source: "balance",
      amount: opts.amountPesewas,
      recipient: opts.recipientCode,
      reason: opts.reason,
      currency: "GHS",
    },
  });
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
