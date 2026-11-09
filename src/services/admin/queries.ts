import { createAdminClient } from "@/lib/supabase/admin";
import { readRate } from "@/services/tutors/rate";
import { listAllEngagements } from "@/services/payments/queries";
import { listUnpaidStudents } from "@/services/payments/unpaid";

/**
 * Admin queries. Pages gate access with requireRole("admin"); reads run on
 * the server-only client and scope explicitly (defense in depth).
 */

export interface PendingTutorRow {
  id: string;
  full_name: string;
  public_code: string | null;
  bio: string | null;
  rate_per_semester: number | null;
  created_at: string;
}

interface TutorProfileRow {
  id: string;
  bio: string | null;
  /** The rate under either column name (0028 renamed it). */
  rate_per_semester?: number | null;
  rate_per_hour?: number | null;
  created_at: string;
  profiles: { full_name: string; public_code: string | null } | { full_name: string; public_code: string | null }[];
}

export async function listPendingTutors(): Promise<PendingTutorRow[]> {
  const supabase = createAdminClient();

  // `*` rather than a column list: naming `rate_per_semester` would break
  // against a database where 0028 hasn't been applied yet (PostgREST errors
  // on an unknown column), and the rate is read from whichever the row has.
  const { data } = await supabase
    .from("tutor_profiles")
    .select("*, profiles(full_name, public_code)")
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true });

  return (data ?? []).map((row: TutorProfileRow) => ({
    id: row.id,
    full_name: Array.isArray(row.profiles) ? row.profiles[0]?.full_name : row.profiles?.full_name,
    public_code: Array.isArray(row.profiles) ? row.profiles[0]?.public_code ?? null : row.profiles?.public_code ?? null,
    bio: row.bio,
    rate_per_semester: readRate(row),
    created_at: row.created_at,
  }));
}

export async function listApprovedTutorsForAdmin(): Promise<number> {
  const supabase = createAdminClient();

  const { count } = await supabase
    .from("tutor_profiles")
    .select("*", { count: "exact", head: true })
    .eq("verification_status", "approved");

  return count ?? 0;
}

/**
 * Platform KPI counts (board tracking): distinct students who booked a
 * session, and the total scheduled sessions. One query, both numbers.
 */
export async function listPlatformStats(): Promise<{
  studentsTutored: number;
  sessionsScheduled: number;
}> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("tutoring_sessions")
    .select("student_id")
    .eq("status", "scheduled");

  const rows = (data ?? []) as { student_id: string }[];
  const students = new Set(rows.map((r) => r.student_id).filter(Boolean));
  return { studentsTutored: students.size, sessionsScheduled: rows.length };
}

export interface PlatformPerson {
  id: string;
  name: string;
  role: "student" | "tutor";
  publicCode: string | null;
  email: string | null;
  joinedAt: string;
  isAdmin: boolean;
  /** Tutors only: the application status (null when no tutor profile yet). */
  tutorStatus: "pending" | "approved" | "rejected" | null;
}

type PersonRow = {
  id: string;
  full_name: string | null;
  role: "student" | "tutor";
  public_code: string | null;
  created_at: string;
  is_admin: boolean | null;
  credentials?: { email: string | null } | { email: string | null }[] | null;
  tutor_profiles?:
    | { verification_status: PlatformPerson["tutorStatus"] }
    | { verification_status: PlatformPerson["tutorStatus"] }[]
    | null;
};

const one = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

/**
 * Everyone on the platform who is a student or a tutor (staff accounts with
 * role `admin` are left out), for the People tab's directory. Admin-only
 * page, so the sign-in email is included.
 */
export async function listPlatformPeople(): Promise<PlatformPerson[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, public_code, created_at, is_admin, credentials(email), tutor_profiles(verification_status)",
    )
    .in("role", ["student", "tutor"])
    .order("full_name")
    .limit(2000);

  if (error) {
    console.error(`[admin] listPlatformPeople: ${error.message}`);
    return [];
  }

  return ((data ?? []) as PersonRow[]).map((row) => ({
    id: row.id,
    name: row.full_name || (row.role === "tutor" ? "Tutor" : "Student"),
    role: row.role,
    publicCode: row.public_code,
    email: one(row.credentials)?.email ?? null,
    joinedAt: row.created_at,
    isAdmin: Boolean(row.is_admin),
    tutorStatus:
      row.role === "tutor"
        ? (one(row.tutor_profiles)?.verification_status ?? null)
        : null,
  }));
}

/**
 * Registered students who have paid nothing yet, split by whether they picked
 * a course (Payments → Unpaid, and the reminder action's eligibility check).
 * The rule itself is pure: `listUnpaidStudents` in services/payments/unpaid.
 */
export async function loadUnpaidStudents() {
  const supabase = createAdminClient();
  const [studentsRes, engagements, requestsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, public_code, created_at, phone, credentials(email)")
      .eq("role", "student")
      .limit(2000),
    listAllEngagements(),
    supabase
      .from("tutor_requests")
      .select("student_id, courses(name, code), tutor_profiles(profiles(full_name))")
      .eq("status", "pending")
      .limit(2000),
  ]);

  if (studentsRes.error) {
    console.error(`[admin] unpaid students lookup failed: ${studentsRes.error.message}`);
  }
  if (requestsRes.error) {
    console.error(`[admin] pending requests lookup failed: ${requestsRes.error.message}`);
  }

  type CourseRef = { name: string | null; code: string | null };
  type RequestRow = {
    student_id: string;
    courses?: CourseRef | CourseRef[] | null;
    tutor_profiles?:
      | { profiles?: { full_name: string | null } | { full_name: string | null }[] | null }
      | { profiles?: { full_name: string | null } | { full_name: string | null }[] | null }[]
      | null;
  };
  type StudentRow = {
    id: string;
    full_name: string | null;
    public_code: string | null;
    created_at: string;
    phone: string | null;
    credentials?: { email: string | null } | { email: string | null }[] | null;
  };

  return listUnpaidStudents({
    students: ((studentsRes.data ?? []) as StudentRow[]).map((s) => ({
      id: s.id,
      name: s.full_name || "Student",
      publicCode: s.public_code,
      email: one(s.credentials)?.email ?? null,
      phone: s.phone,
      joinedAt: s.created_at,
    })),
    engagements,
    pendingRequests: ((requestsRes.data ?? []) as RequestRow[]).map((r) => {
      const course = one(r.courses);
      const tutor = one(one(r.tutor_profiles)?.profiles);
      return {
        studentId: r.student_id,
        courseTitle: course
          ? [course.code, course.name].filter(Boolean).join(" ")
          : "a course",
        tutorName: tutor?.full_name || "a tutor",
      };
    }),
  });
}
