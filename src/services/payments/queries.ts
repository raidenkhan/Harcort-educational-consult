import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { profileIsAdmin } from "@/lib/auth/admin";
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
export type PayoutStatus = "pending_review" | "approved" | "paid" | "held" | "failed";

export interface InstallmentView {
  id: string;
  idx: number;
  amount: bigint;
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
  installments?: Array<{
    id: string;
    idx: number;
    amount: unknown;
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

/** Map a raw engagement row (with embeds) to the public view shape. */
function toEngagementView(row: EngagementRow): EngagementView {
  const total = toBigint(row.agreed_total);
  const installments = [...(row.installments ?? [])].sort((a, b) => a.idx - b.idx);
  const paid = installments
    .filter((i) => i.status === "paid")
    .reduce<bigint>((acc, i) => acc + toBigint(i.amount), BigInt(0));
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
      dueAt: i.due_at,
      status: i.status as InstallmentStatus,
      wasOverdue: i.was_overdue,
      paidAt: i.paid_at,
    })),
    createdAt: row.created_at,
  };
}

const ENGAGEMENT_SELECT = `
  id, status, agreed_total, platform_fee_bps, created_at, student_id,
  installments(id, idx, amount, due_at, status, was_overdue, paid_at),
  courses(name),
  profiles!engagements_student_id_fkey(full_name, public_code),
  tutor_profiles(profiles(full_name))
`;

// ---------------------------------------------------------------------------
// Student view
// ---------------------------------------------------------------------------

/** The student's engagements (payment dashboard rows). */
export async function listStudentEngagements(profile: Profile): Promise<EngagementView[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("engagements")
    .select(ENGAGEMENT_SELECT)
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listStudentEngagements: ${error.message}`);
  return (data ?? []).map((row) => toEngagementView(row as unknown as EngagementRow));
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

  const { data, error } = await supabase
    .from("engagements")
    .select(ENGAGEMENT_SELECT)
    .eq("tutor_profile_id", (tutorProfile as { id: string }).id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listTutorEngagements: ${error.message}`);
  return (data ?? []).map((row) => toEngagementView(row as unknown as EngagementRow));
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
      `id, engagement_id, amount, platform_fee, status, flag_reason, paid_at, created_at,
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
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("engagements")
    .select(ENGAGEMENT_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listAllEngagements: ${error.message}`);
  return (data ?? []).map((row) => toEngagementView(row as unknown as EngagementRow));
}

/** Every payout (admin queue), pending/flagged first, then newest. */
export async function listAllPayouts(): Promise<PayoutView[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("payouts")
    .select(
      `id, engagement_id, amount, platform_fee, status, flag_reason, paid_at, created_at,
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
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }));

  // Flagged + pending first (the admin's work queue), then newest.
  const rank: Record<PayoutStatus, number> = {
    pending_review: 0,
    approved: 1,
    held: 2,
    paid: 3,
    failed: 4,
  };
  return views.sort((a, b) => rank[a.status] - rank[b.status]);
}
