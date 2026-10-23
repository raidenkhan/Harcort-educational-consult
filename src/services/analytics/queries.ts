import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { chatDayKey } from "@/lib/time";

/**
 * Admin performance analytics — money in/out, the request funnel, sessions,
 * people, and first-party traffic (0025).
 *
 * One read pass, aggregated in TypeScript: at this scale (a single tutor
 * marketplace, not a data warehouse) that keeps the SQL boring and the page
 * able to render partial data when a table is empty or a migration hasn't
 * been applied yet. Every query is best-effort: a missing table logs and
 * contributes zeros instead of 500-ing the admin console.
 *
 * The page that renders this MUST gate with requireRole("admin") first.
 */

export interface TrafficDay {
  day: string;
  views: number;
  visitors: number;
}

export interface TrafficSnapshot {
  viewsToday: number;
  visitorsToday: number;
  views7d: number;
  views30d: number;
  visitors30d: number;
  /** Last 14 Accra days, oldest first — the sparkline. */
  byDay: TrafficDay[];
  topPages: Array<{ path: string; views: number; share: number }>;
  topReferrers: Array<{ host: string; views: number }>;
}

export interface MoneySnapshot {
  collectedAllTime: bigint;
  collected30d: bigint;
  paymentsCount: number;
  averagePayment: bigint;
  platformFees: bigint;
  paidOut: bigint;
  owedToTutors: bigint;
  outstandingFromStudents: bigint;
  /** Last 14 Accra days, oldest first. */
  byDay: Array<{ day: string; collected: bigint }>;
}

export interface FunnelSnapshot {
  requests: number;
  pending: number;
  accepted: number;
  declined: number;
  withdrawn: number;
  /** accepted / (accepted + declined), 0–100. */
  acceptanceRate: number;
  /** Mean hours from request sent to tutor response. */
  avgResponseHours: number | null;
  engagements: {
    live: number;
    awaitingPayment: number;
    completed: number;
    cancelled: number;
  };
}

export interface SessionSnapshot {
  scheduled: number;
  upcoming: number;
  confirmed: number;
  cancelled: number;
  /** confirmed / scheduled, 0–100. */
  completionRate: number;
}

export interface PeopleSnapshot {
  students: number;
  tutors: number;
  admins: number;
  newStudents30d: number;
  newTutors30d: number;
}

export interface TutorPerformanceRow {
  name: string;
  sessions: number;
  confirmedSessions: number;
  earnings: bigint;
}

export interface AnalyticsSnapshot {
  traffic: TrafficSnapshot;
  money: MoneySnapshot;
  funnel: FunnelSnapshot;
  sessions: SessionSnapshot;
  people: PeopleSnapshot;
  tutors: TutorPerformanceRow[];
  generatedAt: string;
}

const DAY_MS = 86_400_000;
const TREND_DAYS = 14;

/** ISO timestamp N days before `now`. */
function cutoffIso(days: number, now: number): string {
  return new Date(now - days * DAY_MS).toISOString();
}

/** The last N Accra day keys, oldest first. */
function recentDays(now: number, days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    chatDayKey(now - (days - 1 - i) * DAY_MS),
  );
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt((value as string) ?? "0");
}

/** Best-effort read: log a failure, contribute zeros. */
function rows<T>(result: { data: unknown; error: { message: string } | null }, label: string): T[] {
  if (result.error) {
    console.error(`[analytics] ${label} failed: ${result.error.message}`);
    return [];
  }
  return (result.data ?? []) as T[];
}

export async function getAnalyticsSnapshot(now = Date.now()): Promise<AnalyticsSnapshot> {
  const supabase = createAdminClient();
  const iso7 = cutoffIso(7, now);
  const iso30 = cutoffIso(30, now);
  const dayKeys = recentDays(now, TREND_DAYS);
  const todayKey = chatDayKey(now);

  // 0029: partial payments — ask for paid_amount, tolerating a database
  // that hasn't caught up (the outstanding math falls back accordingly).
  let installmentsRes = await supabase
    .from("installments")
    .select("amount, status, paid_amount");
  if (installmentsRes.error && /paid_amount/i.test(installmentsRes.error.message ?? "")) {
    installmentsRes = await supabase.from("installments").select("amount, status");
  }
  const [viewsRes, paymentsRes, payoutsRes, engagementsRes, requestsRes, sessionsRes, profilesRes, tutorProfilesRes] =
    await Promise.all([
      supabase
        .from("page_views")
        .select("path, referrer_host, visitor_hash, created_at")
        .gte("created_at", iso30)
        .order("created_at", { ascending: false })
        .limit(20000),
      supabase.from("payments").select("amount, status, created_at, verified_at"),
      supabase.from("payouts").select("amount, platform_fee, status, tutor_profile_id"),
      supabase.from("engagements").select("status"),
      supabase.from("tutor_requests").select("status, created_at, responded_at"),
      supabase
        .from("tutoring_sessions")
        .select("status, scheduled_at, tutor_confirmed_at, student_confirmed_at, tutor_profile_id"),
      supabase.from("profiles").select("role, is_admin, created_at"),
      supabase.from("tutor_profiles").select("id, profiles(full_name)"),
    ]);

  // ── Traffic ─────────────────────────────────────────────────────────────
  const views = rows<{
    path: string;
    referrer_host: string | null;
    visitor_hash: string;
    created_at: string;
  }>(viewsRes, "page_views");

  const viewsToday = views.filter((v) => chatDayKey(new Date(v.created_at).getTime()) === todayKey);
  const views7d = views.filter((v) => v.created_at >= iso7);

  const viewsByDay = new Map<string, number>();
  const visitorsByDay = new Map<string, Set<string>>();
  const pageCounts = new Map<string, number>();
  const referrerCounts = new Map<string, number>();

  for (const view of views) {
    const day = chatDayKey(new Date(view.created_at).getTime());
    viewsByDay.set(day, (viewsByDay.get(day) ?? 0) + 1);
    const set = visitorsByDay.get(day) ?? new Set<string>();
    set.add(view.visitor_hash);
    visitorsByDay.set(day, set);

    pageCounts.set(view.path, (pageCounts.get(view.path) ?? 0) + 1);
    if (view.referrer_host) {
      referrerCounts.set(view.referrer_host, (referrerCounts.get(view.referrer_host) ?? 0) + 1);
    }
  }

  const traffic: TrafficSnapshot = {
    viewsToday: viewsToday.length,
    visitorsToday: new Set(viewsToday.map((v) => v.visitor_hash)).size,
    views7d: views7d.length,
    views30d: views.length,
    visitors30d: new Set(views.map((v) => v.visitor_hash)).size,
    byDay: dayKeys.map((day) => ({
      day,
      views: viewsByDay.get(day) ?? 0,
      visitors: visitorsByDay.get(day)?.size ?? 0,
    })),
    topPages: [...pageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([path, count]) => ({
        path,
        views: count,
        share: percent(count, views.length),
      })),
    topReferrers: [...referrerCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([host, count]) => ({ host, views: count })),
  };

  // ── Money in ────────────────────────────────────────────────────────────
  const payments = rows<{
    amount: unknown;
    status: string;
    created_at: string;
    verified_at: string | null;
  }>(paymentsRes, "payments").filter((p) => p.status === "paid");

  const collectedByDay = new Map<string, bigint>();
  let collectedAllTime = BigInt(0);
  let collected30d = BigInt(0);

  for (const payment of payments) {
    const amount = toBigint(payment.amount);
    collectedAllTime += amount;
    const paidAt = payment.verified_at ?? payment.created_at;
    if (paidAt >= iso30) collected30d += amount;
    const bucket = dayKeys.includes(chatDayKey(new Date(paidAt).getTime()))
      ? chatDayKey(new Date(paidAt).getTime())
      : null;
    if (bucket) {
      collectedByDay.set(bucket, (collectedByDay.get(bucket) ?? BigInt(0)) + amount);
    }
  }

  const payouts = rows<{
    amount: unknown;
    platform_fee: unknown;
    status: string;
    tutor_profile_id: string;
  }>(payoutsRes, "payouts");

  let platformFees = BigInt(0);
  let paidOut = BigInt(0);
  let owedToTutors = BigInt(0);
  const earningsByTutor = new Map<string, bigint>();

  for (const payout of payouts) {
    const amount = toBigint(payout.amount);
    if (payout.status !== "failed") platformFees += toBigint(payout.platform_fee);
    if (payout.status === "paid") {
      paidOut += amount;
      earningsByTutor.set(
        payout.tutor_profile_id,
        (earningsByTutor.get(payout.tutor_profile_id) ?? BigInt(0)) + amount,
      );
    } else if (payout.status !== "failed") {
      owedToTutors += amount;
    }
  }

  const outstandingFromStudents = rows<{
    amount: unknown;
    status: string;
    paid_amount?: unknown;
  }>(installmentsRes, "installments")
    .filter((i) => i.status === "pending" || i.status === "overdue")
    .reduce(
      (sum, i) =>
        sum + (toBigint(i.amount) - toBigint(i.paid_amount ?? 0)),
      BigInt(0),
    );

  const money: MoneySnapshot = {
    collectedAllTime,
    collected30d,
    paymentsCount: payments.length,
    averagePayment:
      payments.length > 0 ? collectedAllTime / BigInt(payments.length) : BigInt(0),
    platformFees,
    paidOut,
    owedToTutors,
    outstandingFromStudents,
    byDay: dayKeys.map((day) => ({
      day,
      collected: collectedByDay.get(day) ?? BigInt(0),
    })),
  };

  // ── Request funnel ──────────────────────────────────────────────────────
  const requests = rows<{ status: string; created_at: string; responded_at: string | null }>(
    requestsRes,
    "tutor_requests",
  );
  const byStatus = (status: string) => requests.filter((r) => r.status === status).length;
  const accepted = byStatus("accepted");
  const declined = byStatus("declined");

  const responseHours = requests
    .filter((r) => r.responded_at)
    .map(
      (r) =>
        (new Date(r.responded_at as string).getTime() - new Date(r.created_at).getTime()) /
        3_600_000,
    )
    .filter((hours) => Number.isFinite(hours) && hours >= 0);

  const engagementRows = rows<{ status: string }>(engagementsRes, "engagements");
  const engagementCount = (status: string) =>
    engagementRows.filter((e) => e.status === status).length;

  const funnel: FunnelSnapshot = {
    requests: requests.length,
    pending: byStatus("pending"),
    accepted,
    declined,
    withdrawn: byStatus("withdrawn"),
    acceptanceRate: percent(accepted, accepted + declined),
    avgResponseHours:
      responseHours.length > 0
        ? Math.round(
            (responseHours.reduce((sum, h) => sum + h, 0) / responseHours.length) * 10,
          ) / 10
        : null,
    engagements: {
      live: engagementCount("active"),
      awaitingPayment: engagementCount("pending_payment"),
      completed: engagementCount("completed"),
      cancelled: engagementCount("cancelled"),
    },
  };

  // ── Sessions / dual attendance ──────────────────────────────────────────
  const sessionRows = rows<{
    status: string;
    scheduled_at: string;
    tutor_confirmed_at: string | null;
    student_confirmed_at: string | null;
    tutor_profile_id: string;
  }>(sessionsRes, "tutoring_sessions");

  const scheduledSessions = sessionRows.filter((s) => s.status !== "cancelled");
  const confirmedSessions = scheduledSessions.filter(
    (s) => s.tutor_confirmed_at && s.student_confirmed_at,
  );

  const sessions: SessionSnapshot = {
    scheduled: scheduledSessions.length,
    upcoming: scheduledSessions.filter((s) => new Date(s.scheduled_at).getTime() > now).length,
    confirmed: confirmedSessions.length,
    cancelled: sessionRows.filter((s) => s.status === "cancelled").length,
    completionRate: percent(confirmedSessions.length, scheduledSessions.length),
  };

  // ── People ──────────────────────────────────────────────────────────────
  const profiles = rows<{ role: string; is_admin: boolean | null; created_at: string }>(
    profilesRes,
    "profiles",
  );
  const people: PeopleSnapshot = {
    students: profiles.filter((p) => p.role === "student").length,
    tutors: profiles.filter((p) => p.role === "tutor").length,
    admins: profiles.filter((p) => p.is_admin === true || p.role === "admin").length,
    newStudents30d: profiles.filter((p) => p.role === "student" && p.created_at >= iso30).length,
    newTutors30d: profiles.filter((p) => p.role === "tutor" && p.created_at >= iso30).length,
  };

  // ── Tutor performance ───────────────────────────────────────────────────
  const tutorNames = new Map<string, string>();
  for (const raw of rows<{
    id: string;
    profiles?: { full_name: string } | { full_name: string }[] | null;
  }>(tutorProfilesRes, "tutor_profiles")) {
    const profile = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles;
    tutorNames.set(raw.id, profile?.full_name ?? "Tutor");
  }

  const perTutor = new Map<string, { sessions: number; confirmed: number }>();
  for (const session of scheduledSessions) {
    const entry = perTutor.get(session.tutor_profile_id) ?? { sessions: 0, confirmed: 0 };
    entry.sessions += 1;
    if (session.tutor_confirmed_at && session.student_confirmed_at) entry.confirmed += 1;
    perTutor.set(session.tutor_profile_id, entry);
  }

  const tutors: TutorPerformanceRow[] = [...perTutor.entries()]
    .map(([id, counts]) => ({
      name: tutorNames.get(id) ?? "Tutor",
      sessions: counts.sessions,
      confirmedSessions: counts.confirmed,
      earnings: earningsByTutor.get(id) ?? BigInt(0),
    }))
    .sort((a, b) => b.confirmedSessions - a.confirmedSessions || b.sessions - a.sessions)
    .slice(0, 6);

  return {
    traffic,
    money,
    funnel,
    sessions,
    people,
    tutors,
    generatedAt: new Date(now).toISOString(),
  };
}
