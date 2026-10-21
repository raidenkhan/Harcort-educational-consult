import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeSessionMode,
  type SessionMode,
} from "@/services/auth/sessionFormat";
import type { Profile } from "@/types";

/**
 * Tutor-request queries — the student's sent requests and the tutor's inbox.
 * All scoped explicitly to the acting profile.
 */

export type RequestStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface TutorRequestView {
  id: string;
  status: RequestStatus;
  message: string;
  courseId: string | null;
  courseName: string | null;
  createdAt: string;
  respondedAt: string | null;
  // Populated per audience:
  tutorProfileId?: string;
  tutorName?: string;
  studentId?: string;
  studentName?: string;
  studentPublicCode?: string;
  /** How the student wants THIS engagement tutored (0024). It is per request
   *  on purpose: the same student may pick group with one tutor and
   *  one-on-one with another. `undefined` means the value could not be read
   *  (migration not applied yet) — render nothing rather than claiming a
   *  format the student never chose. */
  sessionMode?: SessionMode;
  /** The tutor's quoted price for this course in whole cedis (as stored on
   *  tutor_services), used by the paywall to show the 50% due. */
  tutorServicePrice: number | null;
  /** The tutor's bookable service (course offer) for this request — used by
   *  the accepted-request "Pay 50%" CTA to create the agreement (0012 flow:
   *  request-first, pay-after-acceptance). Resolved from the tutor's active
   *  tutor_services; null when the tutor hasn't quoted this course yet. */
  tutorServiceId?: string;
}

const REQUEST_SELECT = `
  id, status, message, course_id, created_at, responded_at,
  courses(name),
  tutor_profiles!tutor_requests_tutor_profile_id_fkey(
    id,
    profiles(full_name),
    tutor_services(id, course_id, price)
  ),
  profiles!tutor_requests_student_id_fkey(id, full_name, public_code)
`;

/** PostgREST embeds arrive as object or array — normalize to one (or null). */
function one<T>(embedded: T | T[] | null | undefined): T | null {
  if (embedded === null || embedded === undefined) return null;
  return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded;
}

function toView(raw: unknown): TutorRequestView {
  const row = raw as {
    id: string;
    status: string;
    message: string;
    course_id: string | null;
    created_at: string;
    responded_at: string | null;
    courses?: { name: string } | null;
    tutor_profiles?: {
      id: string;
      profiles?: { full_name: string } | null;
      tutor_services?:
        | Array<{ id: string; course_id: string; price: unknown }>
        | null;
    } | null;
    profiles?: {
      id: string;
      full_name: string;
      public_code: string | null;
    } | null;
  };

  const tp = one(row.tutor_profiles);
  const student = one(row.profiles);
  const course = one(row.courses);

  // Exact course match only — the CTA creates a REAL money agreement, so we
  // never silently substitute a different (e.g. cheapest) offer. No match →
  // null → the card shows "price not published yet" instead of a pay button.
  const services = tp?.tutor_services ?? [];
  const matched = row.course_id
    ? (services.find((s) => s.course_id === row.course_id) ?? null)
    : null;

  return {
    id: row.id,
    status: row.status as RequestStatus,
    message: row.message ?? "",
    courseId: row.course_id,
    courseName: course?.name ?? null,
    tutorServiceId: matched?.id,
    tutorServicePrice: matched ? Number(matched.price) : null,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    tutorProfileId: tp?.id,
    tutorName: tp?.profiles?.full_name ?? "",
    studentId: student?.id,
    studentName: student?.full_name ?? "",
    studentPublicCode: student?.public_code ?? undefined,
  };
}

/**
 * Session formats for a set of requests (0024).
 *
 * Best-effort and separate from the request select on purpose: `session_mode`
 * only exists once migration 0024 is applied, and both the student's list and
 * the tutor's inbox have to keep rendering either way. A missing column is
 * logged, never fatal — the same contract as the course library's asset
 * queries.
 */
async function listRequestSessionModes(
  requestIds: string[],
): Promise<Map<string, SessionMode>> {
  const ids = [...new Set(requestIds)];
  if (ids.length === 0) return new Map();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tutor_requests")
    .select("id, session_mode")
    .in("id", ids);

  if (error) {
    console.error(`[requests] session_mode lookup failed: ${error.message}`);
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [
      row.id as string,
      normalizeSessionMode((row as { session_mode?: unknown }).session_mode),
    ]),
  );
}

/** Attach each request's own session format (0024). */
async function withSessionModes(
  views: TutorRequestView[],
): Promise<TutorRequestView[]> {
  const modes = await listRequestSessionModes(views.map((view) => view.id));
  return views.map((view) => ({ ...view, sessionMode: modes.get(view.id) }));
}

/** The student's sent requests, newest first. */
export async function listStudentRequests(profile: Profile): Promise<TutorRequestView[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tutor_requests")
    .select(REQUEST_SELECT)
    .eq("student_id", profile.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listStudentRequests: ${error.message}`);
  return withSessionModes((data ?? []).map((row) => toView(row)));
}

/** The tutor's inbox, pending first then newest. */
export async function listTutorInbox(profile: Profile): Promise<TutorRequestView[]> {
  const supabase = createAdminClient();

  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!tutorProfile) return [];

  const { data, error } = await supabase
    .from("tutor_requests")
    .select(REQUEST_SELECT)
    .eq("tutor_profile_id", (tutorProfile as { id: string }).id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listTutorInbox: ${error.message}`);

  // Every request carries the format the student chose for THAT request.
  const withModes = await withSessionModes((data ?? []).map((row) => toView(row)));

  const rank: Record<RequestStatus, number> = {
    pending: 0,
    accepted: 1,
    declined: 2,
    withdrawn: 3,
  };
  return withModes.sort(
    (a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt),
  );
}
