/**
 * Domain types shared across the app.
 * These mirror the database schema defined in supabase/migrations/0001_init.sql.
 */

import type { SessionMode } from "@/services/auth/sessionFormat";

export type UserRole = "student" | "tutor" | "admin";

/** Stored as text in the DB (0017/0021 convention) with a CHECK constraint.
 *  The union lives with its runtime values in `sessionFormat.ts`; re-exported
 *  here so the type has a single definition. */
export type { SessionMode };

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
  /** Null until a brand-new Google account finishes the one-time role pick
   *  (0010). Email sign-ups and linked/backfilled accounts are always set. */
  onboarding_completed_at?: string | null;
  /** Human-quotable tracking code (0012) — HC-S-… for students, HC-T-… for
   *  tutors. Support/WhatsApp reference; never a secret. */
  public_code?: string | null;
  /** The program a student declared (0019) — mirrors a `courses.subject`
   *  value; null until they pick one from the dashboard. */
  program?: string | null;
  /** The student's current year (0020) — 1–4, null until they pick one. */
  year?: number | null;
  /** How the student wants to be tutored (0021) — 'one_on_one' | 'group'.
   *  Chosen at sign-up, editable from the dashboard, shown to the tutor on
   *  every request. Optional in the type because a profile read before
   *  migration 0021 is applied has no such column. */
  session_mode?: SessionMode | null;
  /** Phone we text session updates to (0022). Optional for every role;
   *  optional in the type because a profile read before 0022 has no column. */
  phone?: string | null;
  /** True when the user has turned SMS off (0027). Optional for the same
   *  reason — a profile read before 0027 has no column. */
  sms_opt_out?: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  subject: string;
  name: string;
  description: string | null;
  /** The year this course is normally taken (0020) — 1–4, null = not
   *  year-specific. */
  year: number | null;
  /** KNUST course code, e.g. "ME 255" (0026). Null on legacy topic rows. */
  code?: string | null;
  /** Credit hours (0026). */
  credits?: number | null;
  /** 1 or 2; null = runs across both / not semester-bound (0026). */
  semester?: number | null;
  created_at: string;
}

/**
 * A downloadable course resource (0017). `category` and `file_format` are
 * free text validated against app-level allowlists — see
 * services/courses/schemas.ts for why they are not DB enums.
 */
export interface CourseMaterial {
  id: string;
  course_id: string;
  title: string;
  category: string;
  file_format: string;
  /** External link (Drive, institutional repo) — no storage bucket is used. */
  file_url: string;
  description: string | null;
  /** 1 | 2 (0018); null = term not assigned yet. Content groups by term. */
  semester: number | null;
  created_at: string;
}

/** A tutorial video attached to a course (0017). YouTube-only for now. */
export interface CourseVideo {
  id: string;
  course_id: string;
  provider: string;
  /** Provider video id (11-character YouTube id). */
  video_id: string;
  title: string;
  topic: string | null;
  duration: string | null;
  description: string | null;
  sort_order: number;
  /** 1 | 2 (0018); null = term not assigned yet. Content groups by term. */
  semester: number | null;
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

/**
 * A study group (0023) — a course-scoped room a tutor runs for their
 * students. Students join by sharing the short `join_code`; everyone in the
 * group sees a shared message feed. `is_archived` is a soft-delete so the
 * owner's audit trail (and the group's messages) survives.
 */
export interface StudyGroup {
  id: string;
  name: string;
  course_id: string | null;
  description: string | null;
  /** Short human-quotable code (e.g. "K7M2QX") the owner shares to invite. */
  join_code: string;
  /** The tutor (or admin) who created the group — its owner. */
  created_by: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export type StudyGroupRole = "owner" | "member";

export interface StudyGroupMember {
  id: string;
  group_id: string;
  profile_id: string;
  role: StudyGroupRole;
  joined_at: string;
}

export interface StudyGroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}
