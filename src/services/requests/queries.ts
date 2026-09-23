import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
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
}

const REQUEST_SELECT = `
  id, status, message, course_id, created_at, responded_at,
  courses(name),
  tutor_profiles!tutor_requests_tutor_profile_id_fkey(id, profiles(full_name)),
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

  return {
    id: row.id,
    status: row.status as RequestStatus,
    message: row.message ?? "",
    courseId: row.course_id,
    courseName: course?.name ?? null,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    tutorProfileId: tp?.id,
    tutorName: tp?.profiles?.full_name ?? "",
    studentId: student?.id,
    studentName: student?.full_name ?? "",
    studentPublicCode: student?.public_code ?? undefined,
  };
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
  return (data ?? []).map((row) => toView(row));
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

  const views = (data ?? []).map((row) => toView(row));
  const rank: Record<RequestStatus, number> = {
    pending: 0,
    accepted: 1,
    declined: 2,
    withdrawn: 3,
  };
  return views.sort(
    (a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt),
  );
}
