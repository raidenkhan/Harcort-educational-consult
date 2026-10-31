import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/email/client";

/**
 * SMS notifications — provider-swappable, a no-op without a key.
 *
 * Mirrors the Resend email module (`src/lib/email/`): every send is
 * best-effort — it never throws and never blocks the caller — and anything
 * triggered from a server action runs after the response via Next's `after()`.
 * When the API key is missing (local dev, CI) sending is a silent
 * no-op, so the app never depends on SMS being configured.
 *
 * The provider is chosen with `SMS_PROVIDER` (default `arkesel`). Each one
 * implements the small `SmsAdapter` interface below; everything else — the
 * claim → caps → balance-guard → send → mark pipeline, the dedupe key, the
 * opt-out — is shared, so switching provider is an env change plus one
 * adapter, never a call-site change. Credentials are read from the neutral
 * names first (SMS_API_KEY, SMS_SANDBOX, …) with the original ARKESEL_*
 * names as fallback, so existing deployments keep working unchanged.
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
  | "group_added"
  | "reset"
  | "test";

/** The SMS providers the app knows about. */
export type SmsProvider = "arkesel" | "mnotify" | "hubtel";

/**
 * Which provider to talk to — `SMS_PROVIDER` (default `arkesel`).
 *
 * A provider only becomes usable once its adapter is registered in ADAPTERS
 * below; selecting one that isn't wired up makes every send fail loudly (and
 * `isSmsConfigured()` false) rather than silently using the wrong API.
 */
export function smsProvider(): SmsProvider {
  const raw = (process.env.SMS_PROVIDER ?? "").trim().toLowerCase();
  return raw === "mnotify" || raw === "hubtel" ? raw : "arkesel";
}

/**
 * The API key, cleaned up.
 *
 * A key pasted into a dashboard field often arrives with a trailing space, a
 * carriage return, or the quotes the user typed around it — and the provider
 * answers that with a bare "401 Invalid key", which looks exactly like a
 * wrong key. Trimming and stripping the quotes here makes the app immune to
 * that whole class of paste accident.
 *
 * Read from the neutral `SMS_API_KEY` with the original `ARKESEL_API_KEY` as
 * fallback, so moving to another provider doesn't have to be a big-bang env
 * change.
 */
export function smsApiKey(): string {
  return (process.env.SMS_API_KEY ?? process.env.ARKESEL_API_KEY ?? "")
    .trim()
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .trim();
}

/** True when a key is configured AND the selected provider is wired up. */
export function isSmsConfigured(): boolean {
  return smsApiKey().length > 0 && Boolean(smsAdapter());
}

/**
 * Sandbox mode: the provider accepts the request, does not bill it and does
 * not forward it to the mobile networks. Set SMS_SANDBOX=1 (or the original
 * ARKESEL_SANDBOX=1) to use it.
 */
export function smsSandbox(): boolean {
  const raw = (
    process.env.SMS_SANDBOX ?? process.env.ARKESEL_SANDBOX ?? ""
  )
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Sender ID shown on the handset (Arkesel caps this at 11 characters). */
export const SMS_SENDER_ID = (
  process.env.SMS_SENDER_ID ?? process.env.ARKESEL_SENDER_ID ?? "Harcourt"
).slice(0, 11);

/** Max texts the app may send in a day (all recipients, all reasons). */
function dailyCap(): number {
  const raw = Number(
    process.env.SMS_DAILY_CAP ?? process.env.ARKESEL_DAILY_CAP,
  );
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 200;
}

/** Stop sending when the account drops below this many credits. */
function minBalance(): number {
  const raw = Number(
    process.env.SMS_MIN_BALANCE ?? process.env.ARKESEL_MIN_BALANCE,
  );
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 50;
}

/** Per-recipient texts per day — a stranger's number can't be spammed. */
function perNumberCap(): number {
  const raw = Number(
    process.env.SMS_PER_NUMBER_CAP ?? process.env.ARKESEL_PER_NUMBER_CAP,
  );
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

/** Why the last balance lookup failed — shown in the admin console, because
 *  "no balance" and "broken balance" look identical otherwise. */
let balanceFailure: string | null = null;

export function lastBalanceFailure(): string | null {
  return balanceFailure;
}

/**
 * The account balance — dispatched to the active provider's adapter.
 *
 * Cached briefly (the check runs on the send path; the provider should not
 * see a request per text), and a failure is surfaced to the admin with the
 * provider's own message rather than a silent null.
 */
export async function getSmsBalance(force = false): Promise<SmsBalance | null> {
  const apiKey = smsApiKey();
  if (!apiKey) return null;

  if (!force && balanceCache && Date.now() - balanceCache.at < BALANCE_TTL_MS) {
    return balanceCache.value;
  }

  const adapter = smsAdapter();
  if (!adapter) {
    balanceFailure = `SMS provider "${smsProvider()}" isn't wired up yet`;
    console.error(`[sms] ${balanceFailure}`);
    return null;
  }

  const { balance, failure } = await adapter.balance(apiKey);
  if (balance) {
    balanceCache = { at: Date.now(), value: balance };
    balanceFailure = null;
  } else {
    balanceFailure = failure ?? "unknown failure";
  }
  return balance;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface SendResult {
  ok: boolean;
  /** Why it failed (or why it was skipped). */
  error?: string;
  /** The provider's message id — the key a delivery report comes back with. */
  smsId?: string;
  /** Set when the message was deliberately not sent. */
  skipped?: boolean;
  /**
   * Accepted by the provider's SANDBOX: the API answers with a real-looking
   * message id, nothing is billed and nothing ever reaches a handset. Callers
   * that report back to a human must check this — a sandbox send is not a
   * delivered text.
   */
  sandbox?: boolean;
}

/**
 * Written to the send log instead of a delivery status when sandbox mode
 * swallowed the message. Arkesel's sandbox returns a genuine UUID, so a row
 * marked "sent" would be a lie — the exact confusion that made three test
 * texts look delivered when the network had never seen them.
 */
const SANDBOX_NOTE =
  "Sandbox mode: the provider accepted the message but never forwards it to a handset. Set SMS_SANDBOX=0 to send real texts.";

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
  patch: {
    status: string;
    sms_id?: string | null;
    error?: string | null;
    /** The provider's own verdict, verbatim (e.g. SANDBOX). */
    deliveryStatus?: string | null;
  },
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("sms_messages")
    .update({
      status: patch.status,
      sms_id: patch.sms_id ?? null,
      error: patch.error ?? null,
      delivery_status: patch.deliveryStatus ?? null,
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

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

/**
 * What a provider must do. Adding mnotify/hubtel later = implement both
 * methods, register the adapter in ADAPTERS — the pipeline in `sendSms`
 * (claim → caps → balance guard → send → mark) is shared and untouched.
 */
interface SmsAdapter {
  send(input: {
    apiKey: string;
    /** Normalized recipient, international digits (233241234567). */
    to: string;
    message: string;
    sender: string;
    sandbox: boolean;
    /** Absolute URL for delivery reports, or null when APP_URL is unset. */
    callbackUrl: string | null;
  }): Promise<SendResult>;
  balance(
    apiKey: string,
  ): Promise<{ balance: SmsBalance | null; failure: string | null }>;
}

/** Arkesel — the provider Harcourt started on (sms.arkesel.com). */
const arkeselAdapter: SmsAdapter = {
  async send({ apiKey, to, message, sender, sandbox, callbackUrl }) {
    try {
      const res = await fetch(`${ARKESEL_BASE}${ARKESEL_SEND_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          sender,
          message,
          recipients: [to],
          use_case: "transactional",
          ...(sandbox ? { sandbox: true } : {}),
          ...(callbackUrl ? { callback_url: callbackUrl } : {}),
        }),
      });

      const data = (await res
        .json()
        .catch(() => null)) as ArkeselSendResponse | null;

      if (!res.ok || data?.status === "error") {
        const reason = data?.message ?? `HTTP ${res.status}`;
        console.error(`[sms] Arkesel send failed: ${reason}`);
        return { ok: false, error: reason };
      }

      const { smsId, rejected } = extractSmsId(data?.data);
      if (rejected.length > 0) {
        const reason = `Arkesel rejected: ${rejected.join(", ")}`;
        console.error(`[sms] ${reason}`);
        return { ok: false, error: reason };
      }

      return { ok: true, smsId };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "SMS send failed.";
      console.error("[sms] Arkesel exception:", err);
      return { ok: false, error: reason };
    }
  },

  /**
   * Two documented endpoints, tried in order:
   *   1. GET /api/v2/clients/balance-details  (header `api-key`)
   *   2. GET /sms/api?action=check-balance&api_key=…&response=json  (the
   *      legacy one, which answers with `balance` / `main_balance`)
   *
   * Either is enough; a failure on both comes back as the provider's own
   * message so the admin sees WHY there is no balance.
   */
  async balance(apiKey) {
    let failure: string | null = null;

    // ── 1. The v2 endpoint ───────────────────────────────────────────────
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
        message?: string;
        data?: {
          sms_balance?: string | number;
          main_balance?: string | number;
        };
      } | null;

      if (res.ok && json?.status === "success" && json.data) {
        return {
          balance: {
            smsBalance: Number(json.data.sms_balance ?? 0),
            mainBalance: String(json.data.main_balance ?? ""),
          },
          failure: null,
        };
      }
      failure = `HTTP ${res.status} ${json?.status ?? ""} ${json?.message ?? ""}`.trim();
      console.error(`[sms] balance check failed: ${failure}`);
    } catch (err) {
      failure = err instanceof Error ? err.message : "request failed";
      console.error("[sms] balance check exception:", err);
    }

    // ── 2. The legacy endpoint ───────────────────────────────────────────
    try {
      const url = new URL(`${ARKESEL_BASE}/sms/api`);
      url.searchParams.set("action", "check-balance");
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("response", "json");

      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as {
        code?: string;
        message?: string;
        balance?: number | string;
        main_balance?: number | string;
      } | null;

      if (res.ok && json && (json.code === "ok" || json.balance !== undefined)) {
        return {
          balance: {
            smsBalance: Number(json.balance ?? 0),
            mainBalance: String(json.main_balance ?? ""),
          },
          failure: null,
        };
      }
      console.error(
        `[sms] legacy balance check failed: HTTP ${res.status} ${json?.code ?? ""} ${json?.message ?? ""}`,
      );
    } catch (err) {
      console.error("[sms] legacy balance check exception:", err);
    }

    return { balance: null, failure };
  },
};

/** Wired adapters, by provider. mnotify/hubtel land here when we pick one. */
const ADAPTERS: Partial<Record<SmsProvider, SmsAdapter>> = {
  arkesel: arkeselAdapter,
};

function smsAdapter(): SmsAdapter | null {
  return ADAPTERS[smsProvider()] ?? null;
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
  const apiKey = smsApiKey();
  const adapter = smsAdapter();
  if (!apiKey || !adapter) {
    const reason = !apiKey
      ? "SMS isn't configured (missing SMS_API_KEY)."
      : `SMS provider "${smsProvider()}" isn't wired up yet.`;
    console.log(`[sms] ${reason} — no-op for ${opts.to}`);
    return { ok: false, error: reason };
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
  const sandbox = smsSandbox();
  const result = await adapter.send({
    apiKey,
    to,
    message: opts.message,
    sender: SMS_SENDER_ID,
    sandbox,
    callbackUrl: APP_URL ? `${APP_URL}/api/sms/delivery` : null,
  });

  if (result.ok) {
    // Sandbox hands back a real UUID for a message the network never sees.
    // Logging that as "sent" would make the console claim a delivery that
    // cannot happen, so it is recorded as skipped with the reason attached —
    // and it does not eat the daily cap (which ignores skipped rows).
    await markSend(claim.rowId, {
      status: sandbox ? "skipped" : "sent",
      sms_id: result.smsId ?? null,
      error: sandbox ? SANDBOX_NOTE : null,
      deliveryStatus: sandbox ? "SANDBOX" : null,
    });
    if (sandbox) console.warn(`[sms] ${SANDBOX_NOTE} (${to})`);
    return sandbox ? { ...result, sandbox: true } : result;
  }

  await markSend(claim.rowId, { status: "failed", error: result.error });
  return result;
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
