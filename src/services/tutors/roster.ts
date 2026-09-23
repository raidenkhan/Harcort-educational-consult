import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/types";

/**
 * The tutor's roster — every student they're working with, one row per
 * student, fusing three domains:
 *
 *   sessions     → meeting times (upcoming) + finished topics (dual-ticked)
 *   requests     → who was accepted, for which course
 *   engagements  → payment progress (paid / remaining, installment states)
 *
 * Students appear if ANY of the three exists: an accepted request, an
 * engagement, or a session. That covers pairs who agreed on money, pairs
 * still pre-payment, and pairs who just meet without money yet.
 */

export interface RosterEntry {
  studentId: string;
  studentName: string;
  studentPublicCode: string | null;
  courseName: string | null;
  /** Engagement money snapshot (null when no agreement exists yet). */
  payments: {
    status: "pending_payment" | "active" | "completed" | "cancelled";
    agreedTotal: bigint;
    paid: bigint;
    remaining: bigint;
    installments: Array<{
      idx: number;
      amount: bigint;
      status: "pending" | "paid" | "overdue" | "waived";
      dueAt: string;
    }>;
  } | null;
  /** Next scheduled meeting (null when none upcoming). */
  nextMeeting: { when: string; topic: string | null } | null;
  /** Upcoming meeting count. */
  upcomingCount: number;
  /** Dual-ticked sessions — the delivered curriculum. */
  finishedTopics: Array<{ topic: string; when: string }>;
}

/** PostgREST embeds arrive as object or array — normalize to one (or null). */
function one<T>(embedded: T | T[] | null | undefined): T | null {
  if (embedded === null || embedded === undefined) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

function toBigint(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  return BigInt((value as string) ?? "0");
}

export async function listTutorRoster(profile: Profile): Promise<RosterEntry[]> {
  const supabase = createAdminClient();

  // Resolve the acting tutor's tutor_profile id.
  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!tutorProfile) return [];
  const tutorProfileId = (tutorProfile as { id: string }).id;

  // Three parallel fetches — sessions, accepted requests, engagements.
  const [sessionsRes, requestsRes, engagementsRes] = await Promise.all([
    supabase
      .from("tutoring_sessions")
      .select(
        `id, student_id, scheduled_at, duration_minutes, topic, status,
         tutor_confirmed_at, student_confirmed_at,
         profiles!tutoring_sessions_student_id_fkey(full_name, public_code)`,
      )
      .eq("tutor_profile_id", tutorProfileId)
      .order("scheduled_at", { ascending: true }),
    supabase
      .from("tutor_requests")
      .select(
        `id, student_id, course_id, status, created_at,
         profiles!tutor_requests_student_id_fkey(full_name, public_code),
         courses(name)`,
      )
      .eq("tutor_profile_id", tutorProfileId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false }),
    supabase
      .from("engagements")
      .select(
        `id, student_id, status, agreed_total, platform_fee_bps,
         installments(idx, amount, status, due_at),
         courses(name)`,
      )
      .eq("tutor_profile_id", tutorProfileId)
      .order("created_at", { ascending: false }),
  ]);

  const sessions = (sessionsRes.data ?? []) as unknown as Array<{
    id: string;
    student_id: string;
    scheduled_at: string;
    duration_minutes: number;
    topic: string | null;
    status: string;
    tutor_confirmed_at: string | null;
    student_confirmed_at: string | null;
    profiles?: { full_name: string; public_code: string | null } | null;
  }>;

  const requests = ((requestsRes.data ?? []) as unknown as Array<{
    id: string;
    student_id: string;
    course_id: string | null;
    status: string;
    created_at: string;
    profiles?: { full_name: string; public_code: string | null } | null;
    courses?: { name: string } | null;
  }>).map((r) => ({ ...r, profiles: one(r.profiles), courses: one(r.courses) }));

  const engagements = ((engagementsRes.data ?? []) as unknown as Array<{
    id: string;
    student_id: string;
    status: string;
    agreed_total: unknown;
    platform_fee_bps: number;
    installments?: Array<{
      idx: number;
      amount: unknown;
      status: string;
      due_at: string;
    }>;
    courses?: { name: string } | null;
  }>).map((e) => ({ ...e, courses: one(e.courses) }));

  // ---- Fuse by student_id -------------------------------------------------
  const byStudent = new Map<
    string,
    RosterEntry & { sessions: typeof sessions; engagementRows: typeof engagements }
  >();

  const ensure = (
    studentId: string,
    name: string,
    code: string | null,
  ) => {
    let entry = byStudent.get(studentId);
    if (!entry) {
      entry = {
        studentId,
        studentName: name,
        studentPublicCode: code,
        courseName: null,
        payments: null,
        nextMeeting: null,
        upcomingCount: 0,
        finishedTopics: [],
        sessions: [],
        engagementRows: [],
      };
      byStudent.set(studentId, entry);
    }
    if (!entry.studentName && name) entry.studentName = name;
    if (!entry.studentPublicCode && code) entry.studentPublicCode = code;
    return entry;
  };

  const now = Date.now();

  for (const s of sessions) {
    const p = one(s.profiles);
    const entry = ensure(s.student_id, p?.full_name ?? "", p?.public_code ?? null);
    entry.sessions.push(s);
  }

  for (const r of requests) {
    const p = one(r.profiles);
    const entry = ensure(r.student_id, p?.full_name ?? "", p?.public_code ?? null);
    if (!entry.courseName && r.courses?.name) entry.courseName = r.courses.name;
  }

  for (const e of engagements) {
    const entry = ensure(e.student_id, "", null);
    if (!entry.courseName && e.courses?.name) entry.courseName = e.courses.name;
    entry.engagementRows.push(e);
  }

  // ---- Derive per-student view fields ------------------------------------
  const out: RosterEntry[] = [];
  for (const entry of byStudent.values()) {
    const upcoming = entry.sessions
      .filter((s) => s.status === "scheduled" && new Date(s.scheduled_at).getTime() > now)
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const finished = entry.sessions
      .filter(
        (s) =>
          s.status === "scheduled" &&
          s.tutor_confirmed_at &&
          s.student_confirmed_at &&
          s.topic,
      )
      .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

    const engagement =
      entry.engagementRows.find((e) => e.status === "active") ??
      entry.engagementRows.find((e) => e.status === "pending_payment") ??
      entry.engagementRows.find((e) => e.status === "completed") ??
      entry.engagementRows[0] ??
      null;

    const installments = (engagement?.installments ?? [])
      .slice()
      .sort((a, b) => a.idx - b.idx)
      .map((i) => ({
        idx: i.idx,
        amount: toBigint(i.amount),
        status: i.status as "pending" | "paid" | "overdue" | "waived",
        dueAt: i.due_at,
      }));
    const paid = installments
      .filter((i) => i.status === "paid")
      .reduce<bigint>((acc, i) => acc + i.amount, BigInt(0));

    out.push({
      studentId: entry.studentId,
      studentName: entry.studentName || "Student",
      studentPublicCode: entry.studentPublicCode,
      courseName: entry.courseName,
      payments: engagement
        ? {
            status: engagement.status as "pending_payment" | "active" | "completed" | "cancelled",
            agreedTotal: toBigint(engagement.agreed_total),
            paid,
            remaining: toBigint(engagement.agreed_total) - paid,
            installments,
          }
        : null,
      nextMeeting: upcoming[0]
        ? {
            when: upcoming[0].scheduled_at,
            topic: upcoming[0].topic,
          }
        : null,
      upcomingCount: upcoming.length,
      finishedTopics: finished.map((s) => ({
        topic: s.topic as string,
        when: s.scheduled_at,
      })),
    });
  }

  // Students with upcoming sessions first, then by name.
  return out.sort((a, b) => {
    if (a.nextMeeting && b.nextMeeting) {
      return a.nextMeeting.when.localeCompare(b.nextMeeting.when);
    }
    if (a.nextMeeting) return -1;
    if (b.nextMeeting) return 1;
    return a.studentName.localeCompare(b.studentName);
  });
}
