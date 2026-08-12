/**
 * Domain types shared across the app.
 * These mirror the database schema defined in supabase/migrations/0001_init.sql.
 */

export type UserRole = "student" | "tutor" | "admin";

export type TutorStatus = "pending" | "approved" | "rejected";

export type ConversationStatus = "open" | "closed";

export type ReportStatus = "open" | "resolved" | "dismissed";

export type SessionStatus = "scheduled" | "cancelled";

export interface Profile {
  id: string;
  full_name: string;
  /** The primary role (student | tutor). Admin is a privilege, not a role —
   *  see is_admin. Legacy 'admin' values still exist (pre-0008) and are
   *  treated as admins by profileIsAdmin(). */
  role: UserRole;
  /** Admin privilege flag (0008) — a tutor can also be an admin. */
  is_admin: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  subject: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface TutorProfile {
  id: string;
  profile_id: string;
  bio: string | null;
  qualifications: string | null;
  rate_per_hour: number | null;
  verification_status: TutorStatus;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TutorService {
  id: string;
  tutor_profile_id: string;
  course_id: string;
  price: number;
  description: string | null;
  created_at: string;
}

export interface Conversation {
  id: string;
  /** Null when the admin is the other participant (see 0007). */
  student_id: string | null;
  /** Null when the admin is the other participant (see 0007). */
  tutor_profile_id: string | null;
  /** Set when an admin participates (student↔admin or tutor↔admin). */
  admin_id: string | null;
  status: ConversationStatus;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

/**
 * A scheduled tutoring session (timetable entry). Both sides tick attendance
 * independently; the timestamps are null until the respective party confirms.
 */
export interface TutoringSession {
  id: string;
  tutor_profile_id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  topic: string | null;
  location: string | null;
  notes: string | null;
  status: SessionStatus;
  cancelled_at: string | null;
  cancelled_by: string | null;
  tutor_confirmed_at: string | null;
  student_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}
