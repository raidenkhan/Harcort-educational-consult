import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/postgres";
import { profileIsAdmin } from "@/lib/auth/admin";
import {
  normalizeSessionMode,
  type SessionMode,
} from "@/services/auth/sessionFormat";
import {
  hashPaymentToken,
  isPlausiblePaymentToken,
} from "@/services/payments/links";
import type { Profile } from "@/types";

/**
 * Payments read queries. Every query is scoped explicitly to the acting
 * profile: a student sees their engagements, a tutor sees engagements for
 * their tutor_profile, and the admin views gate on the is_admin flag before
 * any unscoped read happens.
 *
 * All money values cross this boundary as BIGINT pesewas (Supabase returns
 * BIGINT as string — `toBigint` normalizes both).
 */

export type InstallmentStatus = "pending" | "paid" | "overdue" | "waived";
export type PayoutStatus = "pending_review" | "approved" | "transferring" | "paid" | "held" | "failed";
export interface TransferRequeryRow {
  payoutId: string;
  transferCode: string;
}

export interface InstallmentView {
  id: string;
  idx: number;
  amount: bigint;
  /** How much has actually landed against this installment (0029 partial
   *  payments). Equals `amount` once fully paid. */
  paidAmount: bigint;
  dueAt: string;
  status: InstallmentStatus;
  wasOverdue: boolean;
  paidAt: string | null;
}

export interface EngagementView {
  id: string;
  status: "pending_payment" | "active" | "completed" | "cancelled";
  agreedTotal: bigint;
  paidPesewas: bigint;
  remainingPesewas: bigint;
  tutorShare: bigint;
  platformFee: bigint;
  courseTitle: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  tutorName: string;
  installments: InstallmentView[];
  createdAt: string;
  /** Date the admin and student agreed the balance will be settled (0032).
   *  Null when no promise has been made yet. */
  expectedFullPaymentAt: string | null;
}

export interface PayoutView {
  id: string;
  engagementId: string;
  tutorName: string;
  studentName: string;
  studentCode: string | null;
  courseTitle: string;
  amount: bigint;
  platformFee: bigint;
  status: PayoutStatus;
  flagReason: string | null;
  /** Paystack transfer code once a transfer has been initiated (0015). */
  transferCode: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PayoutAccountView {
  provider: "mtn" | "telecel" | "airteltigo";
  phone: string;
  accountName: string | null;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt((value as string) ?? "0");
}

/** PostgREST embeds arrive as object or array depending on the relationship
 *  cardinality — normalize to the single object (or null). */
function one<T>(embedded: T | T[] | null | undefined): T | null {
  if (embedded === null || embedded === undefined) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

interface EngagementRow {
  id: string;
  status: string;
  agreed_total: unknown;
  platform_fee_bps: number;
  created_at: string;
  student_id: string;
  /** 0032 — the promised full-payment date. Absent before the migration. */
  expected_full_payment_at?: string | null;
  installments?: Array<{
    id: string;
    idx: number;
    amount: unknown;
    /** 0029 — partial-payment accumulation. Absent before the migration. */
    paid_amount?: unknown;
    due_at: string;
    status: string;
    was_overdue: boolean;
    paid_at: string | null;
  }>;
  courses?: { name: string } | { name: string }[] | null;
  profiles?:
    | { full_name: string; public_code: string | null }
    | { full_name: string; public_code: string | null }[]
    | null;
  tutor_profiles?:
    | { profiles?: { full_name: string } | { full_name: string }[] | null }
    | { profiles?: { full_name: string } | { full_name: string }[] | null }[]
    | null;
}

/** How much has actually landed across an agreement's installments.
 *
 *  0029 tracks partials in `paid_amount`; before it, a paid installment was
 *  paid in full. Reading whichever shape the rows carry keeps the console
 *  correct on a database that hasn't caught up. */
function paidFromInstallments(
  installments: Array<{ amount: unknown; paid_amount?: unknown; status: string }>,
): bigint {
  const hasPartialTracking = installments.some((i) => i.paid_amount != null);
  return hasPartialTracking
    ? installments.reduce<bigint>(
        (acc, i) => acc + toBigint(i.paid_amount ?? 0),
        BigInt(0),
      )
    : installments
        .filter((i) => i.status === "paid")
        .reduce<bigint>((acc, i) => acc + toBigint(i.amount), BigInt(0));
}

/** Map a raw engagement row (with embeds) to the public view shape. */
function toEngagementView(row: EngagementRow): EngagementView {
  const total = toBigint(row.agreed_total);
  const installments = [...(row.installments ?? [])].sort((a, b) => a.idx - b.idx);
  const paid = paidFromInstallments(installments);
  const fee = (total * BigInt(row.platform_fee_bps ?? 1000)) / BigInt(10000);

  return {
    id: row.id,
    status: row.status as EngagementView["status"],
    agreedTotal: total,
    paidPesewas: paid,
    remainingPesewas: total - paid,
    tutorShare: total - fee,
    platformFee: fee,
    courseTitle: one(row.courses)?.name ?? "",
    studentId: row.student_id,
    studentName: one(row.profiles)?.full_name ?? "",
    studentCode: one(row.profiles)?.public_code ?? null,
    tutorName: one(one(row.tutor_profiles)?.profiles)?.full_name ?? "",
    installments: installments.map((i) => ({
      id: i.id,
      idx: i.idx,
      amount: toBigint(i.amount),
      paidAmount:
        i.paid_amount != null
          ? toBigint(i.paid_amount)
          : toBigint(i.status === "paid" ? i.amount : 0),
      dueAt: i.due_at,
      status: i.status as InstallmentStatus,
      wasOverdue: i.was_overdue,
      paidAt: i.paid_at,
    })),
    createdAt: row.created_at,
    expectedFullPaymentAt: row.expected_full_payment_at ?? null,
  };
}

const ENGAGEMENT_SELECT_V3 = `
  id, status, agreed_total, platform_fee_bps, created_at, student_id,
  expected_full_payment_at,
  installments(id, idx, amount, due_at, status, was_overdue, paid_at, paid_amount),
  courses(name),
  profiles!engagements_student_id_fkey(full_name, public_code),
  tutor_profiles(profiles(full_name))
`;

const ENGAGEMENT_SELECT_V2 = `
  id, status, agreed_total, platform_fee_bps, created_at, student_id,
  installments(id, idx, amount, due_at, status, was_overdue, paid_at, paid_amount),
  courses(name),
  profiles!engagements_student_id_fkey(full_name, public_code),
  tutor_profiles(profiles(full_name))
`;

/** Pre-0029 column set — the fallback when the database hasn't caught up. */
const ENGAGEMENT_SELECT_BASE = `
  id, status, agreed_total, platform_fee_bps, created_at, student_id,
  installments(id, idx, amount, due_at, status, was_overdue, paid_at),
  courses(name),
  profiles!engagements_student_id_fkey(full_name, public_code),
  tutor_profiles(profiles(full_name))
`;

/**
 * Engagement lists tolerate a database that hasn't caught up: the newest
 * select asks for the 0032 promise date, then 0029's `paid_amount`, then the
 * base set. The mapper reads whichever shape the rows carry — a missing
 * column must never blank the money console.
 */
async function listEngagements(
  filter: { field: string; value: string } | null,
  label: string,
): Promise<EngagementView[]> {
  const supabase = createAdminClient();
  const run = async (select: string) => {
    let query = supabase.from("engagements").select(select);
    if (filter) query = query.eq(filter.field, filter.value);
    return query.order("created_at", { ascending: false });
  };

  let { data, error } = await run(ENGAGEMENT_SELECT_V3);
  if (error && isMissingColumn(error)) {
    ({ data, error } = await run(ENGAGEMENT_SELECT_V2));
  }
  if (error && isMissingColumn(error)) {
    ({ data, error } = await run(ENGAGEMENT_SELECT_BASE));
  }
  if (error) throw new Error(`${label}: ${error.message}`);
  return (data ?? []).map((row) => toEngagementView(row as unknown as EngagementRow));
}

// ---------------------------------------------------------------------------
// Student view
// ---------------------------------------------------------------------------

/** The student's engagements (payment dashboard rows). */
export async function listStudentEngagements(profile: Profile): Promise<EngagementView[]> {
  return listEngagements({ field: "student_id", value: profile.id }, "listStudentEngagements");
}

// ---------------------------------------------------------------------------
// Tutor view
// ---------------------------------------------------------------------------

/** The tutor's engagements (earnings view), scoped to their tutor_profile. */
export async function listTutorEngagements(profile: Profile): Promise<EngagementView[]> {
  const supabase = createAdminClient();

  const { data: tutorProfile, error: tutorError } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (tutorError) throw new Error(`listTutorEngagements: ${tutorError.message}`);
  if (!tutorProfile) return []; // not a tutor (yet) — empty earnings view

  return listEngagements(
    { field: "tutor_profile_id", value: (tutorProfile as { id: string }).id },
    "listTutorEngagements",
  );
}

/** Does the profile own an APPROVED tutor profile? (payout-account gate) */
export async function hasApprovedTutorProfile(profile: Profile): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tutor_profiles")
    .select("verification_status")
    .eq("profile_id", profile.id)
    .maybeSingle();
  return (
    Boolean(data) &&
    (data as { verification_status: string } | null)?.verification_status === "approved"
  );
}

/** The tutor's saved MoMo payout account, or null when none exists yet. */
export async function getPayoutAccount(
  profile: Profile,
): Promise<PayoutAccountView | null> {
  const supabase = createAdminClient();

  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!tutorProfile) return null;

  const { data } = await supabase
    .from("tutor_payout_accounts")
    .select("provider, phone, account_name, verified_at")
    .eq("tutor_profile_id", (tutorProfile as { id: string }).id)
    .maybeSingle();
  if (!data) return null;

  const row = data as {
    provider: PayoutAccountView["provider"];
    phone: string;
    account_name: string | null;
    verified_at: string | null;
  };
  return {
    provider: row.provider,
    phone: row.phone,
    accountName: row.account_name,
    verified: Boolean(row.verified_at),
  };
}

/** The tutor's payouts, newest first. */
export async function listTutorPayouts(profile: Profile): Promise<PayoutView[]> {
  const supabase = createAdminClient();

  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!tutorProfile) return [];

  const { data, error } = await supabase
    .from("payouts")
    .select(
      `id, engagement_id, amount, platform_fee, status, flag_reason, transfer_code, paid_at, created_at,
       engagements!payouts_engagement_id_fkey(
         courses(name),
         profiles!engagements_student_id_fkey(full_name, public_code)
       ),
       tutor_profiles(profiles(full_name))`,
    )
    .eq("tutor_profile_id", (tutorProfile as { id: string }).id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listTutorPayouts: ${error.message}`);

  return (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      engagement_id: string;
      amount: unknown;
      platform_fee: unknown;
      status: string;
      flag_reason: string | null;
      transfer_code: string | null;
      paid_at: string | null;
      created_at: string;
      engagements?: {
        courses?: { name: string } | null;
        profiles?: { full_name: string; public_code: string | null } | null;
      } | null;
      tutor_profiles?: { profiles?: { full_name: string } | null } | null;
    };
    return {
      id: row.id,
      engagementId: row.engagement_id,
      tutorName: row.tutor_profiles?.profiles?.full_name ?? "",
      studentName: row.engagements?.profiles?.full_name ?? "",
      studentCode: row.engagements?.profiles?.public_code ?? null,
      courseTitle: row.engagements?.courses?.name ?? "",
      amount: toBigint(row.amount),
      platformFee: toBigint(row.platform_fee),
      status: row.status as PayoutStatus,
      flagReason: row.flag_reason,
      transferCode: row.transfer_code,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    };
  });
}

// ---------------------------------------------------------------------------
// Admin views (callers MUST gate with requirePaymentsAdmin first)
// ---------------------------------------------------------------------------

/** Admin gate — throws unless the profile carries the admin privilege. */
export async function requirePaymentsAdmin(profile: Profile): Promise<void> {
  if (!profileIsAdmin(profile)) {
    throw new Error("forbidden: admin only");
  }
}

/** Every engagement, newest first (admin console). */
export async function listAllEngagements(): Promise<EngagementView[]> {
  return listEngagements(null, "listAllEngagements");
}

// ---------------------------------------------------------------------------
// Payment log (admin console, 0029)
// ---------------------------------------------------------------------------

export interface PaymentLogRow {
  id: string;
  engagementId: string;
  courseTitle: string;
  studentName: string;
  tutorName: string;
  amount: bigint;
  status: string;
  /** "admin" = recorded out-of-band by an admin; "paystack" = webhook-verified. */
  source: "paystack" | "admin";
  reference: string;
  /** Free-text note an admin left when recording an out-of-band payment. */
  note: string | null;
  createdAt: string;
}

/** The newest payments across every engagement — both channels in one log. */
export async function listRecentPaymentsForAdmin(limit = 50): Promise<PaymentLogRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payments")
    .select(
      `id, engagement_id, amount, status, paystack_reference, paystack_status, raw_payload, created_at,
       engagements(courses(name), profiles!engagements_student_id_fkey(full_name), tutor_profiles(profiles(full_name)))`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listRecentPaymentsForAdmin: ${error.message}`);

  return (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      engagement_id: string;
      amount: unknown;
      status: string;
      paystack_reference: string;
      paystack_status: string | null;
      raw_payload: { note?: string } | null;
      created_at: string;
      engagements?: {
        courses?: { name: string } | null;
        profiles?: { full_name: string } | null;
        tutor_profiles?: { profiles?: { full_name: string } | null } | null;
      } | null;
    };
    return {
      id: row.id,
      engagementId: row.engagement_id,
      courseTitle: row.engagements?.courses?.name ?? "",
      studentName: row.engagements?.profiles?.full_name ?? "",
      tutorName: row.engagements?.tutor_profiles?.profiles?.full_name ?? "",
      amount: toBigint(row.amount),
      status: row.status,
      source: row.paystack_status === "admin_recorded" ? "admin" : "paystack",
      reference: row.paystack_reference,
      note: row.raw_payload?.note ?? null,
      createdAt: row.created_at,
    };
  });
}

/** Every payout (admin queue), pending/flagged first, then newest. */
export async function listAllPayouts(): Promise<PayoutView[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(
      `id, engagement_id, amount, platform_fee, status, flag_reason, transfer_code, paid_at, created_at,
       engagements(
         courses(name),
         profiles!engagements_student_id_fkey(full_name, public_code)
       ),
       tutor_profiles(profiles(full_name))`,
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAllPayouts: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    engagement_id: string;
    amount: unknown;
    platform_fee: unknown;
    status: string;
    flag_reason: string | null;
    transfer_code: string | null;
    paid_at: string | null;
    created_at: string;
    engagements?: {
      courses?: { name: string } | null;
      profiles?: { full_name: string; public_code: string | null } | null;
    } | null;
    tutor_profiles?: { profiles?: { full_name: string } | null } | null;
  }>;

  const views = rows.map((row) => ({
    id: row.id,
    engagementId: row.engagement_id,
    tutorName: row.tutor_profiles?.profiles?.full_name ?? "",
    studentName: row.engagements?.profiles?.full_name ?? "",
    studentCode: row.engagements?.profiles?.public_code ?? null,
    courseTitle: row.engagements?.courses?.name ?? "",
    amount: toBigint(row.amount),
    platformFee: toBigint(row.platform_fee),
    status: row.status as PayoutStatus,
    flagReason: row.flag_reason,
    transferCode: row.transfer_code,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }));

  // Flagged + pending first (the admin's work queue), then newest.
  const rank: Record<PayoutStatus, number> = {
    pending_review: 0,
    approved: 1,
    transferring: 2,
    held: 3,
    paid: 4,
    failed: 5,
  };
  return views.sort((a, b) => rank[a.status] - rank[b.status]);
}

/**
 * Every tutor's saved MoMo payout account (admin console, 0015) with the
 * tutor identity for display, unverified first.
 */
export async function listPayoutAccountsForAdmin(): Promise<
  Array<{
    tutorProfileId: string;
    tutorName: string;
    provider: "mtn" | "telecel" | "airteltigo";
    phone: string;
    accountName: string | null;
    verified: boolean;
  }>
> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tutor_payout_accounts")
    .select(
      `tutor_profile_id, provider, phone, account_name, verified_at,
       tutor_profiles(profiles(full_name))`,
    )
    .order("verified_at", { ascending: true, nullsFirst: true });
  if (error) throw new Error(`listPayoutAccountsForAdmin: ${error.message}`);

  return (data ?? []).map((raw) => {
    const row = raw as {
      tutor_profile_id: string;
      provider: "mtn" | "telecel" | "airteltigo";
      phone: string;
      account_name: string | null;
      verified_at: string | null;
      tutor_profiles?: { profiles?: { full_name: string } | { full_name: string }[] | null } | null;
    };
    return {
      tutorProfileId: row.tutor_profile_id,
      tutorName: one(one(row.tutor_profiles)?.profiles)?.full_name ?? "Tutor",
      provider: row.provider,
      phone: row.phone,
      accountName: row.account_name,
      verified: Boolean(row.verified_at),
    };
  });
}

// ---------------------------------------------------------------------------
// Payment plans & part-payment links (0032)
// ---------------------------------------------------------------------------

export interface PaymentRequestView {
  id: string;
  engagementId: string;
  amount: bigint;
  note: string | null;
  status: "open" | "paid" | "cancelled";
  createdAt: string;
  expiresAt: string | null;
  paidAt: string | null;
  studentName: string;
  studentCode: string | null;
  courseTitle: string;
  tutorName: string;
}

/**
 * A link as the STUDENT sees it on /pay/[token]. It carries the agreement's
 * balance so the page can say "GH₵600 of GH₵1,200 paid" before the student
 * commits — and refuse a link whose agreement is already settled.
 */
export interface PaymentLinkView extends PaymentRequestView {
  studentId: string;
  engagementStatus: string;
  agreedTotal: bigint;
  paidPesewas: bigint;
  remainingPesewas: bigint;
  expectedFullPaymentAt: string | null;
  /** True when the link can still be paid right now. */
  payable: boolean;
}

interface PaymentRequestRow {
  id: string;
  engagement_id: string;
  amount: unknown;
  note: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
  engagements?:
    | {
        status?: string;
        agreed_total?: unknown;
        expected_full_payment_at?: string | null;
        student_id?: string;
        courses?: { name: string } | { name: string }[] | null;
        profiles?:
          | { full_name: string; public_code: string | null }
          | { full_name: string; public_code: string | null }[]
          | null;
        tutor_profiles?:
          | { profiles?: { full_name: string } | { full_name: string }[] | null }
          | { profiles?: { full_name: string } | { full_name: string }[] | null }[]
          | null;
        installments?: Array<{
          amount: unknown;
          paid_amount?: unknown;
          status: string;
        }>;
      }
    | Array<{
        status?: string;
        agreed_total?: unknown;
        expected_full_payment_at?: string | null;
        student_id?: string;
        courses?: { name: string } | { name: string }[] | null;
        profiles?:
          | { full_name: string; public_code: string | null }
          | { full_name: string; public_code: string | null }[]
          | null;
        tutor_profiles?:
          | { profiles?: { full_name: string } | { full_name: string }[] | null }
          | { profiles?: { full_name: string } | { full_name: string }[] | null }[]
          | null;
        installments?: Array<{
          amount: unknown;
          paid_amount?: unknown;
          status: string;
        }>;
      }>
    | null;
}

const PAYMENT_REQUEST_SELECT = `
  id, engagement_id, amount, note, status, created_at, expires_at, paid_at,
  engagements(
    status, agreed_total, expected_full_payment_at, student_id,
    installments(amount, paid_amount, status),
    courses(name),
    profiles!engagements_student_id_fkey(full_name, public_code),
    tutor_profiles(profiles(full_name))
  )
`;

function toPaymentRequestView(row: PaymentRequestRow): PaymentRequestView {
  const engagement = one(row.engagements);
  return {
    id: row.id,
    engagementId: row.engagement_id,
    amount: toBigint(row.amount),
    note: row.note,
    status: row.status as PaymentRequestView["status"],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    studentName: one(engagement?.profiles)?.full_name ?? "",
    studentCode: one(engagement?.profiles)?.public_code ?? null,
    courseTitle: one(engagement?.courses)?.name ?? "",
    tutorName: one(one(engagement?.tutor_profiles)?.profiles)?.full_name ?? "",
  };
}

/** Has this link expired? Expiry is advisory in the DB (the RPC only stores
 *  it) — the pay action enforces it, so a stale link cannot be paid. */
export function isPaymentLinkExpired(
  expiresAt: string | null,
  now: number,
): boolean {
  return expiresAt !== null && Date.parse(expiresAt) < now;
}

/**
 * Resolve a part-payment link from the token in the URL.
 *
 * Only the SHA-256 hash is stored, so this is the one place that turns the
 * student's token into a row. Returns null for an unknown token — never
 * throws, because the page must render "this link is invalid" rather than a
 * 500.
 */
export async function getPaymentLinkByToken(
  token: string,
  now: number,
): Promise<PaymentLinkView | null> {
  if (!isPlausiblePaymentToken(token)) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select(PAYMENT_REQUEST_SELECT)
    .eq("token_hash", hashPaymentToken(token))
    .maybeSingle();

  if (error) {
    // Pre-0032 there is no such table — the link simply doesn't exist yet.
    if (!/does not exist|schema cache|relation/i.test(error.message ?? "")) {
      console.error(`[payments] payment link lookup failed: ${error.message}`);
    }
    return null;
  }
  if (!data) return null;

  const row = data as unknown as PaymentRequestRow;
  const engagement = one(row.engagements);
  const base = toPaymentRequestView(row);
  const total = toBigint(engagement?.agreed_total ?? 0);
  const paid = paidFromInstallments(engagement?.installments ?? []);

  return {
    ...base,
    studentId: engagement?.student_id ?? "",
    engagementStatus: engagement?.status ?? "pending_payment",
    agreedTotal: total,
    paidPesewas: paid,
    remainingPesewas: total - paid,
    expectedFullPaymentAt: engagement?.expected_full_payment_at ?? null,
    payable:
      row.status === "open" &&
      !isPaymentLinkExpired(row.expires_at, now) &&
      (engagement?.status ?? "") !== "cancelled" &&
      total - paid > BigInt(0),
  };
}

/** Every link the admin has issued, newest first (console list). */
export async function listPaymentRequestsForAdmin(
  limit = 50,
): Promise<PaymentRequestView[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select(PAYMENT_REQUEST_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (/does not exist|schema cache|relation/i.test(error.message ?? "")) {
      return []; // pre-0032
    }
    throw new Error(`listPaymentRequestsForAdmin: ${error.message}`);
  }
  return (data ?? []).map((row) => toPaymentRequestView(row as unknown as PaymentRequestRow));
}

export interface OpenPlanRequestView {
  requestId: string;
  studentId: string;
  studentName: string;
  studentCode: string | null;
  courseTitle: string;
  tutorName: string;
  tutorServiceId: string | null;
  sessionMode: SessionMode;
  createdAt: string;
}

/**
 * Requests that could become a payment plan: still live, and with no
 * engagement for that student + tutor service yet.
 *
 * This is the admin's queue of "students who reached the paywall and asked
 * for help" — opening a plan is what makes a part payment recordable.
 */
export async function listOpenRequestsForAdmin(): Promise<OpenPlanRequestView[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("tutor_requests")
    .select(
      `id, student_id, course_id, tutor_profile_id, created_at,
       courses(name),
       profiles!tutor_requests_student_id_fkey(full_name, public_code),
       tutor_profiles(
         id,
         profiles(full_name),
         tutor_services(id, course_id, price, price_group, price_one_on_one)
       )`,
    )
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(`[payments] open request lookup failed: ${error.message}`);
    return [];
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    student_id: string;
    course_id: string | null;
    created_at: string;
    courses?: { name: string } | { name: string }[] | null;
    profiles?:
      | { full_name: string; public_code: string | null }
      | { full_name: string; public_code: string | null }[]
      | null;
    tutor_profiles?:
      | {
          id: string;
          profiles?: { full_name: string } | { full_name: string }[] | null;
          tutor_services?: Array<{ id: string; course_id: string }> | null;
        }
      | Array<{
          id: string;
          profiles?: { full_name: string } | { full_name: string }[] | null;
          tutor_services?: Array<{ id: string; course_id: string }> | null;
        }>
      | null;
  }>;

  if (rows.length === 0) return [];

  // Session format is per request (0024) and lives in its own column so a
  // database without it still renders the queue.
  const modes = new Map<string, SessionMode>();
  const { data: modeRows, error: modeError } = await supabase
    .from("tutor_requests")
    .select("id, session_mode")
    .in("id", rows.map((r) => r.id));
  if (!modeError) {
    for (const row of modeRows ?? []) {
      modes.set(
        (row as { id: string }).id,
        normalizeSessionMode((row as { session_mode?: unknown }).session_mode),
      );
    }
  }

  // Which of those students already have an open agreement for the service?
  const { data: engagementRows } = await supabase
    .from("engagements")
    .select("student_id, tutor_service_id, status")
    .in("status", ["pending_payment", "active", "completed"]);

  const covered = new Set(
    ((engagementRows ?? []) as Array<{
      student_id: string;
      tutor_service_id: string;
    }>).map((e) => `${e.student_id}::${e.tutor_service_id}`),
  );

  return rows
    .map((row) => {
      const tp = one(row.tutor_profiles);
      const service =
        tp?.tutor_services?.find((s) => s.course_id === row.course_id) ?? null;
      return {
        requestId: row.id,
        studentId: row.student_id,
        studentName: one(row.profiles)?.full_name ?? "",
        studentCode: one(row.profiles)?.public_code ?? null,
        courseTitle: one(row.courses)?.name ?? "Course",
        tutorName: one(tp?.profiles)?.full_name ?? "",
        tutorServiceId: service?.id ?? null,
        sessionMode: modes.get(row.id) ?? "one_on_one",
        createdAt: row.created_at,
      };
    })
    .filter(
      (row) =>
        row.tutorServiceId !== null &&
        !covered.has(`${row.studentId}::${row.tutorServiceId}`),
    );
}
