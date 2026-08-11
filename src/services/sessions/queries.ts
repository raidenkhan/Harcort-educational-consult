import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/services/auth/queries";
import type { TutoringSession } from "@/types";

/**
 * Session (timetable) queries.
 * All reads run on the server-only service-role client and scope explicitly
 * to the signed-in user — never a bare "select all".
 *
 * Cancelled sessions are hidden from the tutor/student timetables but kept
 * for the admin's attendance tracker (with who cancelled and when).
 */

export interface SessionView extends TutoringSession {
  student_name: string;
  tutor_name: string;
  cancelled_by_name?: string;
}

interface EmbeddedName {
  full_name?: string;
}

function pickName(value: EmbeddedName | EmbeddedName[] | null | undefined): string {
  if (Array.isArray(value)) return value[0]?.full_name ?? "";
  return value?.full_name ?? "";
}

function toSessionView(
  row: TutoringSession & {
    student?: EmbeddedName | EmbeddedName[] | null;
    tutor_profile?: { profiles?: EmbeddedName | EmbeddedName[] | null } | null;
    canceller?: EmbeddedName | EmbeddedName[] | null;
  },
  fallback: { student_name?: string; tutor_name?: string },
): SessionView {
  return {
    id: row.id,
    tutor_profile_id: row.tutor_profile_id,
    student_id: row.student_id,
    scheduled_at: row.scheduled_at,
    duration_minutes: row.duration_minutes,
    topic: row.topic,
    location: row.location,
    notes: row.notes,
    status: row.status,
    cancelled_at: row.cancelled_at,
    cancelled_by: row.cancelled_by,
    tutor_confirmed_at: row.tutor_confirmed_at,
    student_confirmed_at: row.student_confirmed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    student_name: pickName(row.student) || fallback.student_name || "Student",
    tutor_name:
      pickName(row.tutor_profile?.profiles) || fallback.tutor_name || "Tutor",
    cancelled_by_name: pickName(row.canceller) || undefined,
  };
}

/** Scheduled sessions on the signed-in tutor's timetable (their profile). */
export async function listSessionsForTutor(): Promise<SessionView[]> {
  const current = await getCurrentProfile();
  if (!current) return [];

  const supabase = createAdminClient();

  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", current.id)
    .maybeSingle();

  if (!tutorProfile) return [];

  const { data } = await supabase
    .from("tutoring_sessions")
    .select("*, student:profiles!student_id(full_name)")
    .eq("tutor_profile_id", (tutorProfile as { id: string }).id)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });

  return (data ?? []).map((row) =>
    toSessionView(row as never, { tutor_name: current.full_name }),
  );
}

/** Scheduled sessions booked with the signed-in student. */
export async function listSessionsForStudent(): Promise<SessionView[]> {
  const current = await getCurrentProfile();
  if (!current) return [];

  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tutoring_sessions")
    .select("*, tutor_profile:tutor_profiles(profiles(full_name))")
    .eq("student_id", current.id)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });

  return (data ?? []).map((row) =>
    toSessionView(row as never, { student_name: current.full_name }),
  );
}

/**
 * Every session — including cancelled ones — with both names and who
 * cancelled. The admin attendance tracker.
 */
export async function listSessionsForAdmin(): Promise<SessionView[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tutoring_sessions")
    .select(
      "*, student:profiles!student_id(full_name), tutor_profile:tutor_profiles(profiles(full_name)), canceller:profiles!cancelled_by(full_name)",
    )
    .order("scheduled_at", { ascending: false });

  return (data ?? []).map((row) => toSessionView(row as never, {}));
}

/**
 * The students a tutor may schedule with: anyone with an open conversation
 * with one of the tutor's profiles. Used to populate the schedule form picker.
 */
export async function listTutorStudents(): Promise<
  { id: string; full_name: string }[]
> {
  const current = await getCurrentProfile();
  if (!current) return [];

  const supabase = createAdminClient();

  const { data: tutorProfiles } = await supabase
    .from("tutor_profiles")
    .select("id")
    .eq("profile_id", current.id);

  const tutorProfileIds = (tutorProfiles ?? []).map((t) => t.id as string);
  if (tutorProfileIds.length === 0) return [];

  const { data } = await supabase
    .from("conversations")
    .select("student_id, student:profiles!student_id(full_name)")
    .in("tutor_profile_id", tutorProfileIds)
    .eq("status", "open");

  const seen = new Set<string>();
  const students: { id: string; full_name: string }[] = [];
  for (const row of data ?? []) {
    const id = (row as { student_id: string }).student_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    students.push({
      id,
      full_name:
        pickName((row as { student?: EmbeddedName | EmbeddedName[] }).student) ||
        "Student",
    });
  }
  return students;
}
