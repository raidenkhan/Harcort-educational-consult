import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/email/client";

/**
 * SMS notifications — Arkesel (https://arkesel.com), a no-op without a key.
 *
 * Mirrors the Resend email module (`src/lib/email/`): every send is
 * best-effort — it never throws and never blocks the caller — and anything
 * triggered from a server action runs after the response via Next's `after()`.
 * When `ARKESEL_API_KEY` is missing (local dev, CI) sending is a silent
 * no-op, so the app never depends on SMS being configured.
 *
 * Arkesel's v2 send API is one authenticated JSON POST:
 *   POST https://sms.arkesel.com/api/v2/sms/send
 *   headers: { "api-key": <key>, "Content-Type": "application/json" }
 *   body:    { sender, message, recipients: ["233241234567"] }
 *
 * Two extra fields earn their place:
 *   * `sandbox: true` — the message is NOT billed and NOT delivered to the
 *     mobile networks, so the code path can be exercised for free. Exactly
 *     the Paystack test-mode trick, one key away.
 *   * `callback_url` — Arkesel calls us back with `?sms_id=&status=` (in
 *     batches, ~10 minutes apart) so a delivery report can be matched back to
 *     the row we logged. See src/app/api/sms/delivery/route.ts.
 *
 * ⚠️ SERVER ONLY — recipient numbers are read from profiles through the
 * service-role client (profiles.phone, migration 0022). Never import this
 * from a Client Component.
 *
 * Cost control, because a text costs real money:
 *   * every attempt is logged to `sms_messages` (migration 0027),
 *   * `dedupe_key` is a UNIQUE column — scheduled sends claim it before they
 *     send, so a re-run can never double-text anybody,
 *   * a daily cap and a per-number cap bound the blast radius of a bug,
 *   * the account balance is checked (cached 5 min) so we stop early instead
 *     of sending into a void.
 */

const ARKESEL_BASE = "https://sms.arkesel.com";
const ARKESEL_SEND_PATH = "/api/v2/sms/send";
const ARKESEL_BALANCE_PATH = "/api/v2/clients/balance-details";

/** What a message is about — the admin log groups by this. */
export type SmsKind =
  | "session_reminder"
  | "session_scheduled"
  | "session_cancelled"
  | "request"
  | "request_response"
  | "payment"
  | "payment_reminder"
  | "reset"
  | "test";

/** True when an API key is configured — cheap guard before doing lookups. */
export function isSmsConfigured(): boolean {
  return Boolean(process.env.ARKESEL_API_KEY);
}

/**
 * Sandbox mode: Arkesel accepts the request, does not bill it and does not
 * forward it to the mobile networks. Set ARKESEL_SANDBOX=1 to use it.
 */
export function smsSandbox(): boolean {
  const raw = (process.env.ARKESEL_SANDBOX ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Sender ID shown on the handset (Arkesel caps this at 11 characters). */
export const SMS_SENDER_ID = (
  process.env.ARKESEL_SENDER_ID ?? "Harcourt"
).slice(0, 11);

/** Max texts the app may send in a day (all recipients, all reasons). */
function dailyCap(): number {
  const raw = Number(process.env.ARKESEL_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200;
}

/** Stop sending when the account drops below this many credits. */
function minBalance(): number {
  const raw = Number(process.env.ARKESEL_MIN_BALANCE);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 50;
}

/** Per-recipient texts per day — a stranger's number can't be spammed. */
function perNumberCap(): number {
  const raw = Number(process.env.ARKESEL_PER_NUMBER_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

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

// ---------------------------------------------------------------------------
// Account balance
// ---------------------------------------------------------------------------

export interface SmsBalance {
  /** Remaining SMS credits. */
  smsBalance: number;
  /** Main account balance as Arkesel reports it (a formatted string). */
  mainBalance: string;
}

// Balance lookups are cached briefly — the check runs on the send path, and
// Arkesel should not see a request per text.
let balanceCache: { at: number; value: SmsBalance } | null = null;
const BALANCE_TTL_MS = 5 * 60_000;

export async function getSmsBalance(force = false): Promise<SmsBalance | null> {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) return null;

  if (!force && balanceCache && Date.now() - balanceCache.at < BALANCE_TTL_MS) {
    return balanceCache.value;
  }

  try {
    const res = await fetch(`${ARKESEL_BASE}${ARKESEL_BALANCE_PATH}`, {
      // Arkesel authenticates with the "api-key" header — the same name the
      // send endpoint uses. A differently-spelled header is a 401, and a
      // missing balance would silently let the app send into a void.
      headers: { "api-key": apiKey },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      data?: { sms_balance?: string | number; main_balance?: string | number };
    } | null;
    if (!res.ok || json?.status !== "success" || !json.data) {
      console.error(
        `[sms] balance check failed: HTTP ${res.status} ${json?.status ?? ""}`,
      );
      return null;
    }
    const value: SmsBalance = {
      smsBalance: Number(json.data.sms_balance ?? 0),
      mainBalance: String(json.data.main_balance ?? ""),
    };
    balanceCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    console.error("[sms] balance check exception:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface SendResult {
  ok: boolean;
  /** Why it failed (or why it was skipped). */
  error?: string;
  /** Arkesel's message id — the key a delivery report comes back with. */
  smsId?: string;
  /** Set when the message was deliberately not sent. */
  skipped?: boolean;
}

interface ArkeselSendResponse {
  status?: string;
  message?: string;
  data?:
    | { id?: string; credits_used?: number }
    | Array<{ recipient?: string; id?: string }>;
}

/**
 * Pull the message id out of Arkesel's response. The documented shape is a
 * LIST (one entry per recipient, rejected numbers come back without an id);
 * some endpoints answer with a single object. Both are handled.
 */
export function extractSmsId(
  data: ArkeselSendResponse["data"],
): { smsId?: string; rejected: string[] } {
  if (!data) return { rejected: [] };
  if (Array.isArray(data)) {
    const rejected: string[] = [];
    for (const entry of data) {
      if (!entry?.id) {
        rejected.push(entry?.recipient ?? "unknown");
        continue;
      }
      return { smsId: entry.id, rejected };
    }
    return { rejected };
  }
  return { smsId: data.id, rejected: [] };
}

/** The dedupe key a scheduled send claims before it sends. */
export function reminderDedupeKey(
  prefix: string,
  profileId: string,
): string {
  return `${prefix}:${profileId}`;
}

/**
 * Claim the right to send one message. The INSERT is the claim: the unique
 * index on `dedupe_key` means exactly one caller can win, so a re-run of the
 * reminder cron can never double-text anybody.
 *
 * Returns the row id when the send may proceed, or null when it must not
 * (duplicate claim, or the log table is unavailable — in which case we skip
 * rather than send untracked).
 */
async function claimSend(params: {
  profileId: string | null;
  to: string;
  body: string;
  kind: SmsKind;
  dedupeKey?: string;
}): Promise<{ rowId: number | null; reason?: string }> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("sms_messages")
    .insert({
      profile_id: params.profileId,
      to_number: params.to,
      body: params.body,
      kind: params.kind,
      status: "pending",
      dedupe_key: params.dedupeKey ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique violation = somebody else claimed this send. That is the
    // normal, expected outcome for a re-run — not an error.
    if (error.code === "23505") {
      return { rowId: null, reason: "duplicate" };
    }
    // Anything else (missing migration 0027, DB down): we refuse to send,
    // because an unlogged send is exactly the thing we must never do.
    console.error(`[sms] could not log the send — refusing to send: ${error.message}`);
    return { rowId: null, reason: "log-unavailable" };
  }

  return { rowId: (data as { id: number }).id };
}

async function markSend(
  rowId: number,
  patch: { status: string; sms_id?: string | null; error?: string | null },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sms_messages")
    .update({
      status: patch.status,
      sms_id: patch.sms_id ?? null,
      error: patch.error ?? null,
    })
    .eq("id", rowId);
  if (error) console.error(`[sms] could not update the send log: ${error.message}`);
}

/** Start of today, in Accra — the window the daily cap counts over. */
function accraDayStart(now: number): string {
  // Accra is UTC+0 with no DST, so the UTC day IS the Accra day.
  return new Date(now).toISOString().slice(0, 10) + "T00:00:00.000Z";
}

/** Sends logged today (optionally just for one number). Null when the log
 *  table isn't there yet — the caller then treats the cap as not reached. */
async function countToday(
  options: { toNumber?: string },
  now: number,
): Promise<number | null> {
  const supabase = createAdminClient();
  let query = supabase
    .from("sms_messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", accraDayStart(now))
    .neq("status", "skipped");
  if (options.toNumber) query = query.eq("to_number", options.toNumber);
  const { count, error } = await query;
  if (error) return null;
  return count ?? 0;
}

/**
 * Best-effort send to one number.
 *
 * Order matters: log → claim → guard → send → update. The claim is what
 * makes scheduled sends safe to re-run; the guards are what keep a bug from
 * becoming an expensive habit.
 */
export async function sendSms(opts: {
  to: string;
  message: string;
  kind: SmsKind;
  profileId?: string | null;
  dedupeKey?: string;
  now?: number;
}): Promise<SendResult> {
  const apiKey = process.env.ARKESEL_API_KEY;
  if (!apiKey) {
    console.log(`[sms] Arkesel not configured — no-op for ${opts.to}`);
    return { ok: false, error: "SMS isn't configured (missing ARKESEL_API_KEY)." };
  }

  const to = normalizeGhPhone(opts.to);
  if (!to) {
    console.warn(`[sms] Skipping send — unusable number "${opts.to}"`);
    return { ok: false, error: "Unusable phone number." };
  }

  const claim = await claimSend({
    profileId: opts.profileId ?? null,
    to,
    body: opts.message,
    kind: opts.kind,
    dedupeKey: opts.dedupeKey,
  });
  if (claim.rowId === null) {
    return { ok: false, skipped: true, error: claim.reason };
  }

  const now = opts.now ?? Date.now();

  // ── Guards ──────────────────────────────────────────────────────────────
  const dayTotal = await countToday({}, now);
  if (dayTotal !== null && dayTotal >= dailyCap()) {
    const reason = `daily cap reached (${dayTotal}/${dailyCap()})`;
    await markSend(claim.rowId, { status: "skipped", error: reason });
    console.warn(`[sms] ${reason} — skipping ${to}`);
    return { ok: false, skipped: true, error: reason };
  }

  const forThisNumber = await countToday({ toNumber: to }, now);
  if (forThisNumber !== null && forThisNumber >= perNumberCap()) {
    const reason = `per-number cap reached for ${to}`;
    await markSend(claim.rowId, { status: "skipped", error: reason });
    console.warn(`[sms] ${reason}`);
    return { ok: false, skipped: true, error: reason };
  }

  const balance = await getSmsBalance();
  if (balance && balance.smsBalance < minBalance()) {
    const reason = `balance too low (${balance.smsBalance} < ${minBalance()})`;
    await markSend(claim.rowId, { status: "skipped", error: reason });
    console.error(`[sms] ${reason} — skipping ${to}`);
    return { ok: false, skipped: true, error: reason };
  }

  // ── Send ────────────────────────────────────────────────────────────────
  try {
    const res = await fetch(`${ARKESEL_BASE}${ARKESEL_SEND_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: SMS_SENDER_ID,
        message: opts.message,
        recipients: [to],
        use_case: "transactional",
        ...(smsSandbox() ? { sandbox: true } : {}),
        ...(APP_URL ? { callback_url: `${APP_URL}/api/sms/delivery` } : {}),
      }),
    });

    const data = (await res.json().catch(() => null)) as ArkeselSendResponse | null;

    if (!res.ok || data?.status === "error") {
      const reason = data?.message ?? `HTTP ${res.status}`;
      console.error(`[sms] Arkesel send failed: ${reason}`);
      await markSend(claim.rowId, { status: "failed", error: reason });
      return { ok: false, error: reason };
    }

    const { smsId, rejected } = extractSmsId(data?.data);
    if (rejected.length > 0) {
      const reason = `Arkesel rejected: ${rejected.join(", ")}`;
      console.error(`[sms] ${reason}`);
      await markSend(claim.rowId, { status: "failed", error: reason });
      return { ok: false, error: reason };
    }

    await markSend(claim.rowId, { status: "sent", sms_id: smsId ?? null });
    return { ok: true, smsId };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "SMS send failed.";
    console.error("[sms] Arkesel exception:", err);
    await markSend(claim.rowId, { status: "failed", error: reason });
    return { ok: false, error: reason };
  }
}

/**
 * Phone numbers for the given profiles — only rows that actually have one and
 * haven't opted out of texts. Degrades to an empty map before migration 0022
 * (the `phone` column doesn't exist yet) and again before 0027 (the opt-out
 * column), so a caller simply sends nothing.
 */
export async function phonesForProfiles(
  profileIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (profileIds.length === 0) return map;
  const supabase = createAdminClient();

  // The full read needs 0027 (the opt-out column); the fallback keeps texts
  // working for an app whose database hasn't applied it yet.
  const full = await supabase
    .from("profiles")
    .select("id, phone, sms_opt_out")
    .in("id", profileIds);

  if (!full.error && full.data) {
    const rows = full.data as {
      id: string;
      phone: string | null;
      sms_opt_out: boolean | null;
    }[];
    for (const row of rows) {
      if (row.phone && !row.sms_opt_out) map.set(row.id, row.phone);
    }
    return map;
  }

  const fallback = await supabase
    .from("profiles")
    .select("id, phone")
    .in("id", profileIds);
  if (fallback.error) {
    console.error(`[sms] phone lookup failed: ${fallback.error.message}`);
    return map;
  }
  for (const row of fallback.data ?? []) {
    const phone = (row as { phone: string | null }).phone;
    if (phone) map.set((row as { id: string }).id, phone);
  }
  return map;
}

/** Best-effort SMS to a single profile — awaited when the caller wants the
 *  result (e.g. a "send me a test text" action). Resolves null on success,
 *  the error string otherwise. */
export async function sendSmsToProfile(
  profileId: string,
  message: string,
  kind: SmsKind = "test",
): Promise<string | null> {
  const phones = await phonesForProfiles([profileId]);
  const phone = phones.get(profileId);
  if (!phone) return "No phone number on file.";
  const result = await sendSms({ to: phone, message, kind, profileId });
  return result.ok ? null : (result.error ?? "SMS could not be sent.");
}

/**
 * Fire-and-forget SMS to one or more profiles, scheduled after the response
 * flushes — the SMS twin of `notifySessionScheduled` in `lib/email/notify.ts`.
 * A no-op when SMS isn't configured or none of the profiles have a number.
 *
 * `dedupePrefix` makes the send claimable: each recipient gets the key
 * "<prefix>:<profileId>", so a scheduled job can run twice without texting
 * anybody twice.
 */
export function notifySmsToProfiles(
  profileIds: string[],
  message: string,
  kind: SmsKind,
  dedupePrefix?: string,
): void {
  if (!isSmsConfigured() || profileIds.length === 0) return;

  const run = () => {
    void (async () => {
      const phones = await phonesForProfiles(profileIds);
      await Promise.all(
        [...phones.entries()].map(([profileId, to]) =>
          sendSms({
            to,
            message,
            kind,
            profileId,
            dedupeKey: dedupePrefix
              ? reminderDedupeKey(dedupePrefix, profileId)
              : undefined,
          }),
        ),
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
