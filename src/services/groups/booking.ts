import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingColumn } from "@/lib/postgres";
import { notifyGroupAdded, notifyGroupMessage } from "@/lib/email/notify";
import { scheduleOutboxDrain } from "@/lib/email/outbox";
import {
  groupMatchesCourse,
  groupTitleForCourse,
  newJoinCode,
  sessionBroadcastLine,
  type CourseRef,
} from "./bookingText";

/**
 * GROUP BOOKING — the two guarantees a student gets when they book group
 * sessions for a course:
 *
 *   1. SEATING. A group booking always lands the student in a study group
 *      with the tutor and the other students for that course. Migration 0038
 *      seats them inside the payment transaction, but only when the tutor
 *      has ALREADY created a group — a tutor who never made one left every
 *      group booking outside. `ensureGroupBookingSeat` finds the group or
 *      creates it, seats the student, writes the feed line and notifies both
 *      sides. It runs after a tutor accepts a group request and after every
 *      verified payment (the webhook, the return path and the sweep all
 *      funnel through `reconcileChargeByReference`), so no entry point can
 *      skip it.
 *
 *   2. BROADCAST. When the tutor schedules or cancels a session with a
 *      student who books group sessions, the change is posted into the
 *      group's feed and emailed to the members who didn't get the direct
 *      notification — the timetable reaches the whole group, not just the
 *      student whose row it is.
 *
 * Everything here is best-effort and never throws: seating and broadcasts
 * ride along after the primary action (a payment applied, a request
 * accepted, a session scheduled) and must not undo it. All reads are scoped
 * explicitly — the service-role client bypasses RLS.
 */

type Supabase = ReturnType<typeof createAdminClient>;

export type SeatOutcome = "seated" | "already" | "skipped" | "failed";

/** The tutor's PROFILE id — `study_groups.created_by` — for a tutor profile. */
async function readTutorProfileId(
  supabase: Supabase,
  tutorProfileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("tutor_profiles")
    .select("profile_id")
    .eq("id", tutorProfileId)
    .maybeSingle();
  return (data as { profile_id: string } | null)?.profile_id ?? null;
}

/** The course behind a booking, tolerating a catalogue without `code` (0026). */
async function readCourse(
  supabase: Supabase,
  courseId: string,
): Promise<CourseRef & { name: string | null } | null> {
  const withCode = await supabase
    .from("courses")
    .select("id, code, name")
    .eq("id", courseId)
    .maybeSingle();
  if (!withCode.error) {
    return (withCode.data as { id: string; code: string | null; name: string | null } | null) ?? null;
  }
  if (!isMissingColumn(withCode.error)) {
    console.error(`[groups] course ${courseId} unreadable: ${withCode.error.message}`);
    return null;
  }
  const legacy = await supabase
    .from("courses")
    .select("id, name")
    .eq("id", courseId)
    .maybeSingle();
  if (legacy.error) {
    console.error(`[groups] course ${courseId} unreadable: ${legacy.error.message}`);
    return null;
  }
  const row = legacy.data as { id: string; name: string | null } | null;
  return row ? { ...row, code: null } : null;
}

interface FoundGroup {
  id: string;
  name: string;
}

/**
 * The tutor's non-archived group for this course — matched by CODE (0038's
 * rule: `courses.id` is not a stable identity, the code is), falling back to
 * the row id when the catalogue has no codes yet.
 */
async function findGroupForCourse(
  supabase: Supabase,
  creatorId: string,
  course: CourseRef,
): Promise<FoundGroup | null> {
  const withCode = await supabase
    .from("study_groups")
    .select("id, name, course_id, courses(code)")
    .eq("created_by", creatorId)
    .eq("is_archived", false);

  if (!withCode.error) {
    const rows = (withCode.data ?? []) as unknown as {
      id: string;
      name: string;
      course_id: string | null;
      courses: { code: string | null }[] | null;
    }[];
    for (const row of rows) {
      const group = {
        courseId: row.course_id,
        courseCode: row.courses?.[0]?.code ?? null,
      };
      if (groupMatchesCourse(group, course)) return { id: row.id, name: row.name };
    }
    return null;
  }
  if (!isMissingColumn(withCode.error)) {
    console.error(`[groups] group lookup failed: ${withCode.error.message}`);
    return null;
  }

  // Pre-0026 catalogue: no codes anywhere — the row id is all we have.
  const legacy = await supabase
    .from("study_groups")
    .select("id, name, course_id")
    .eq("created_by", creatorId)
    .eq("is_archived", false);
  if (legacy.error) {
    console.error(`[groups] group lookup failed: ${legacy.error.message}`);
    return null;
  }
  const rows = (legacy.data ?? []) as { id: string; name: string; course_id: string | null }[];
  const match = rows.find((row) => row.course_id === course.id);
  return match ? { id: match.id, name: match.name } : null;
}

/** Create the tutor's group for a course, retrying the (rare) code collision. */
async function createGroupForCourse(
  supabase: Supabase,
  creatorId: string,
  course: CourseRef & { name: string | null },
): Promise<FoundGroup | null> {
  const name = groupTitleForCourse(course);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("study_groups")
      .insert({
        name,
        course_id: course.id,
        description: null,
        join_code: newJoinCode(),
        created_by: creatorId,
      })
      .select("id, name")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") continue; // join-code collision — retry
      console.error(`[groups] could not create group: ${error.message}`);
      return null;
    }
    if (data) return data as FoundGroup;
  }
  return null;
}

async function readName(supabase: Supabase, profileId: string): Promise<string> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", profileId)
    .maybeSingle();
  return (data as { full_name: string | null } | null)?.full_name || "";
}

/**
 * Guarantee the seat: find the tutor's group for this course (create it when
 * they haven't made one), add the student, leave a trace in the feed, and
 * tell both sides. Idempotent — a student already in the group is a no-op, so
 * the payment RPC (0038) and this function can both run without duplicating
 * a membership, a feed line or an email.
 */
export async function ensureGroupBookingSeat(opts: {
  studentId: string;
  /** `tutor_profiles.id` — the id bookings and sessions carry. */
  tutorProfileId: string;
  courseId: string | null;
}): Promise<SeatOutcome> {
  try {
    if (!opts.courseId) return "skipped";

    const supabase = createAdminClient();
    const creatorId = await readTutorProfileId(supabase, opts.tutorProfileId);
    if (!creatorId) return "skipped";

    const course = await readCourse(supabase, opts.courseId);
    if (!course) return "skipped";

    const group =
      (await findGroupForCourse(supabase, creatorId, course)) ??
      (await createGroupForCourse(supabase, creatorId, course));
    if (!group) return "failed";

    const { data: existing } = await supabase
      .from("study_group_members")
      .select("id")
      .eq("group_id", group.id)
      .eq("profile_id", opts.studentId)
      .maybeSingle();
    if (existing) return "already";

    const { error: memberError } = await supabase
      .from("study_group_members")
      .insert({ group_id: group.id, profile_id: opts.studentId, role: "member" });
    if (memberError) {
      if (memberError.code === "23505") return "already";
      console.error(`[groups] could not seat student: ${memberError.message}`);
      return "failed";
    }

    // Membership first, message second — 0036's `last_read_at` default then
    // leaves this line unread for the student who just joined, exactly like
    // the payment RPC's own copy of this block.
    const [studentName, tutorName] = await Promise.all([
      readName(supabase, opts.studentId),
      readName(supabase, creatorId),
    ]);
    const { error: messageError } = await supabase
      .from("study_group_messages")
      .insert({
        group_id: group.id,
        sender_id: creatorId,
        body: `${studentName || "A student"} joined the group after booking group sessions.`,
      });
    if (messageError) {
      console.error(`[groups] join line not written: ${messageError.message}`);
    }

    // The student gets the "you're in" email with a link straight to the
    // group; the tutor gets the outbox row the drain already renders as
    // "a student joined your group".
    notifyGroupAdded({
      recipientProfileIds: [opts.studentId],
      tutorName: tutorName || "Your tutor",
      groupName: group.name,
      courseName: course.name ?? null,
      groupId: group.id,
    });
    const { error: outboxError } = await supabase.from("notification_outbox").insert({
      type: "payment.group_joined",
      audience: "tutor",
      recipient_id: creatorId,
      data: {
        group_id: group.id,
        course_id: course.id,
        student_id: opts.studentId,
      },
    });
    if (outboxError) {
      console.error(`[groups] tutor notification not queued: ${outboxError.message}`);
    } else {
      scheduleOutboxDrain();
    }

    return "seated";
  } catch (err) {
    console.error("[groups] ensureGroupBookingSeat failed", err);
    return "failed";
  }
}

/**
 * Seat after a tutor ACCEPTS a request. Only a `group` request seats — the
 * format is per request (0024), so the same student's one-on-one booking
 * with another tutor is untouched. Never throws.
 */
export async function seatGroupBookingForRequest(requestId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("tutor_requests")
      .select("session_mode, tutor_profile_id, course_id, student_id")
      .eq("id", requestId)
      .maybeSingle();
    if (error || !data) return;
    const row = data as {
      session_mode: string | null;
      tutor_profile_id: string;
      course_id: string | null;
      student_id: string;
    };
    if (row.session_mode !== "group") return;
    await ensureGroupBookingSeat({
      studentId: row.student_id,
      tutorProfileId: row.tutor_profile_id,
      courseId: row.course_id,
    });
  } catch (err) {
    console.error("[groups] seat after accept failed", err);
  }
}

/**
 * Seat after money is applied. The payment RPC (0038/0039) already seats
 * when the tutor has a group; this closes the gap it left — a tutor who
 * never created one — and covers engagements whose payment never ran the
 * RPC's group block (admin part-payments).
 *
 * The group format is decided by the request the charge belongs to: the row
 * whose course matches the engagement wins, then the newest, mirroring the
 * RPC's own auto-accept lookup. Never throws.
 */
export async function seatGroupBookingForEngagement(
  engagementId: string,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data: engagement } = await supabase
      .from("engagements")
      .select("student_id, tutor_profile_id, course_id")
      .eq("id", engagementId)
      .maybeSingle();
    if (!engagement) return;
    const eng = engagement as {
      student_id: string;
      tutor_profile_id: string;
      course_id: string;
    };

    const { data: requests, error } = await supabase
      .from("tutor_requests")
      .select("session_mode, course_id, created_at")
      .eq("student_id", eng.student_id)
      .eq("tutor_profile_id", eng.tutor_profile_id)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });
    if (error || !requests || requests.length === 0) return;

    const rows = requests as { session_mode: string | null; course_id: string | null }[];
    const best = rows.find((r) => r.course_id === eng.course_id) ?? rows[0];
    if (best?.session_mode !== "group") return;

    await ensureGroupBookingSeat({
      studentId: eng.student_id,
      tutorProfileId: eng.tutor_profile_id,
      courseId: eng.course_id,
    });
  } catch (err) {
    console.error("[groups] seat after payment failed", err);
  }
}

/**
 * Post a timetable change into the group the pair actually works in, and
 * email the members who weren't notified directly.
 *
 * Only fires for GROUP bookings (the pair's latest request says `group`) and
 * only for a group the tutor owns that the student is actually in — a
 * one-on-one student who joined a group for its materials never has their
 * private session times broadcast. Never throws: the session itself is
 * already scheduled/cancelled by the time this runs.
 */
export async function broadcastSessionToGroup(opts: {
  kind: "scheduled" | "cancelled";
  /** The profile that acted — the feed line is written as them. */
  actorProfileId: string;
  studentId: string;
  /** `tutor_profiles.id`. */
  tutorProfileId: string;
  when: string;
  topic: string | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const creatorId = await readTutorProfileId(supabase, opts.tutorProfileId);
    if (!creatorId) return;

    // Gate on the pair's format. Pre-0024 the column doesn't exist — the
    // select errors and we skip, which is the old behaviour (no broadcast).
    const { data: latestRequest, error: requestError } = await supabase
      .from("tutor_requests")
      .select("session_mode")
      .eq("student_id", opts.studentId)
      .eq("tutor_profile_id", opts.tutorProfileId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (requestError) return;
    const mode = (latestRequest?.[0] as { session_mode?: string } | undefined)?.session_mode;
    if (mode !== "group") return;

    // The group: owned by this tutor, not archived, the student is in it.
    const { data: memberships } = await supabase
      .from("study_group_members")
      .select("group_id")
      .eq("profile_id", opts.studentId);
    const groupIds = ((memberships ?? []) as { group_id: string }[]).map((m) => m.group_id);
    if (groupIds.length === 0) return;

    const { data: groups } = await supabase
      .from("study_groups")
      .select("id, name")
      .in("id", groupIds)
      .eq("created_by", creatorId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(1);
    const group = (groups?.[0] as { id: string; name: string } | undefined) ?? null;
    if (!group) return;

    const body = sessionBroadcastLine(opts.kind, opts.when, opts.topic);
    const { error: messageError } = await supabase
      .from("study_group_messages")
      .insert({ group_id: group.id, sender_id: opts.actorProfileId, body });
    if (messageError) {
      console.error(`[groups] broadcast not written: ${messageError.message}`);
      return;
    }

    // Everyone else in the group — the actor and the session's own student
    // already got the direct email/text, so emailing them again would double.
    const { data: members } = await supabase
      .from("study_group_members")
      .select("profile_id")
      .eq("group_id", group.id);
    const recipients = ((members ?? []) as { profile_id: string }[])
      .map((m) => m.profile_id)
      .filter((id) => id !== opts.actorProfileId && id !== opts.studentId && id !== creatorId);
    if (recipients.length > 0) {
      notifyGroupMessage({
        recipientProfileIds: recipients,
        senderName: (await readName(supabase, opts.actorProfileId)) || "Your tutor",
        groupName: group.name,
        body,
        groupId: group.id,
      });
    }
  } catch (err) {
    console.error("[groups] session broadcast failed", err);
  }
}
