import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * SMS notifications — Arkesel (https://arkesel.com), a no-op without a key.
 *
 * Mirrors the Resend email module (`src/lib/email/`): every send is
 * best-effort — it never throws and never blocks the caller — and anything
 * triggered from a server action runs after the response via Next's `after()`.
 * When `ARKESEL_API_KEY` is missing (local dev, CI) sending is a silent no-op,
 * so the app never depends on SMS being configured.
 *
 * Arkesel's v2 send API is one authenticated JSON POST:
 *   POST https://sms.arkesel.com/api/v2/sms/send
 *   headers: { "api-key": <key>, "Content-Type": "application/json" }
 *   body:    { sender, message, recipients: ["233241234567"] }
 *
 * ⚠️ SERVER ONLY — recipient numbers are read from profiles through the
 * service-role client (profiles.phone, migration 0022). Never import this
 * from a Client Component.
 */

const ARKESEL_ENDPOINT = "https://sms.arkesel.com/api/v2/sms/send";

/** True when an API key is configured — cheap guard before doing lookups. */
export function isSmsConfigured(): boolean {
  return Boolean(process.env.ARKESEL_API_KEY);
}

/** Sender ID shown on the handset (Arkesel caps this at 11 characters). */
export const SMS_SENDER_ID = (
  process.env.ARKESEL_SENDER_ID ?? "Harcourt"
).slice(0, 11);

/**
 * Normalize a stored number to Arkesel's digits-only international form:
 * "0241234567" → "233241234567", "+233 24 123 4567" → "233241234567". Returns
 * null for anything that isn't a usable Ghana number, and the caller then
 * skips the send rather than mailing a malformed recipient. Pure, so it is
 * unit-tested.
 */
export function normalizeGhPhone(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("233")) return digits;
  if (digits.length === 10 && digits.startsWith("0")) return `233${digits.slice(1)}`;
  return null;
}

/**
 * Best-effort send to one number. Returns an error string (or null on
 * success) instead of throwing — the email module's `deliver()` contract.
 */
export async function sendSms(opts: {
  to: string;
  message: string;
}): Promise<string | null> {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) {
    console.log(`[sms] Arkesel not configured — no-op for ${opts.to}`);
    return "SMS isn't configured (missing ARKESEL_API_KEY).";
  }

  const to = normalizeGhPhone(opts.to);
  if (!to) {
    console.warn(`[sms] Skipping send — unusable number "${opts.to}"`);
    return "Unusable phone number.";
  }

  try {
    const res = await fetch(ARKESEL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: SMS_SENDER_ID,
        message: opts.message,
        recipients: [to],
      }),
    });

    const data = (await res.json().catch(() => null)) as {
      status?: string;
      message?: string;
    } | null;

    if (!res.ok || data?.status === "error") {
      const reason = data?.message ?? `HTTP ${res.status}`;
      console.error(`[sms] Arkesel send failed: ${reason}`);
      return reason;
    }
    return null;
  } catch (err) {
    console.error("[sms] Arkesel exception:", err);
    return err instanceof Error ? err.message : "SMS send failed.";
  }
}

/**
 * Phone numbers for the given profiles — only rows that actually have one.
 * Degrades to an empty map before migration 0022 is applied (the `phone`
 * column doesn't exist yet), so a caller simply sends nothing.
 */
export async function phonesForProfiles(
  profileIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (profileIds.length === 0) return map;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, phone")
    .in("id", profileIds);
  if (error) {
    console.error(`[sms] phone lookup failed: ${error.message}`);
    return map;
  }

  for (const row of data ?? []) {
    if (row.phone) map.set(row.id as string, row.phone as string);
  }
  return map;
}

/** Best-effort SMS to a single profile — awaited when the caller wants the
 *  result (e.g. a "send me a test text" action). Resolves null on success,
 *  the error string otherwise. */
export async function sendSmsToProfile(
  profileId: string,
  message: string,
): Promise<string | null> {
  const phones = await phonesForProfiles([profileId]);
  const phone = phones.get(profileId);
  if (!phone) return "No phone number on file.";
  return sendSms({ to: phone, message });
}

/**
 * Fire-and-forget SMS to one or more profiles, scheduled after the response
 * flushes — the SMS twin of `notifySessionScheduled` in `lib/email/notify.ts`.
 * A no-op when SMS isn't configured or none of the profiles have a number.
 */
export function notifySmsToProfiles(profileIds: string[], message: string): void {
  if (!isSmsConfigured() || profileIds.length === 0) return;

  const run = () => {
    void (async () => {
      const phones = await phonesForProfiles(profileIds);
      await Promise.all(
        [...phones.values()].map((to) => sendSms({ to, message })),
      );
    })().catch((err) => {
      console.error("[sms] notification failed", err);
    });
  };

  try {
    after(run);
  } catch {
    // `after` can throw outside a request scope (e.g. static generation) —
    // fall back to fire-and-forget, exactly like the email module.
    run();
  }
}
