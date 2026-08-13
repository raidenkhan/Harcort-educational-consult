"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyAttendanceTicked,
  notifySessionCancelled,
  notifySessionScheduled,
} from "@/lib/email/notify";
import { sessionWhen } from "@/lib/time";
import { requireProfile } from "@/services/auth/queries";
import { createSessionSchema } from "./schemas";
import type { TutoringSession } from "@/types";

/**
 * Session mutations — the timetable workflow.
 *
 * Security model (same as the rest of the app): everything runs through the
 * server-only service-role client, so every mutation re-derives the acting
 * user from the session cookie and re-checks their role and ownership.
 */

export type SessionFormState = { error?: string; message?: string };

/** A session can be ticked from 15 minutes before its start time onwards. */
const CONFIRM_GRACE_MS = 15 * 60 * 1000;

export async function createSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor") {
    return { error: "Only tutors can schedule sessions." };
  }

  const parsed = createSessionSchema.safeParse({
    studentId: formData.get("studentId"),
    scheduledAt: formData.get("scheduledAt"),
    durationMinutes: formData.get("durationMinutes"),
    topic: formData.get("topic"),
    location: formData.get("location"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Please check the session details.",
    };
  }

  const start = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(start.getTime())) {
    return { error: "Pick a valid date and time." };
  }
  if (start.getTime() <= Date.now()) {
    return { error: "Pick a time in the future." };
  }

  const supabase = createAdminClient();

  // Must own an APPROVED tutor profile before teaching.
  const { data: tutorProfile } = await supabase
    .from("tutor_profiles")
    .select("id, verification_status")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!tutorProfile || (tutorProfile as { verification_status: string }).verification_status !== "approved") {
    return {
      error: "Your tutor profile must be approved before you can schedule sessions.",
    };
  }

  // Tutors may only schedule with students who have actually contacted them.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("tutor_profile_id", (tutorProfile as { id: string }).id)
    .eq("student_id", parsed.data.studentId)
    .maybeSingle();

  if (!conversation) {
    return {
      error: "You can only schedule sessions with students who have reached out to you.",
    };
  }

  const { error } = await supabase.from("tutoring_sessions").insert({
    tutor_profile_id: (tutorProfile as { id: string }).id,
    student_id: parsed.data.studentId,
    scheduled_at: start.toISOString(),
    duration_minutes: parsed.data.durationMinutes,
    topic: parsed.data.topic || null,
    location: parsed.data.location || null,
  });

  if (error) return { error: error.message };

  // Email the student (best-effort, after the response).
  const { data: studentRow } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", parsed.data.studentId)
    .maybeSingle();
  notifySessionScheduled({
    studentProfileId: parsed.data.studentId,
    tutorName: profile.full_name || "Your tutor",
    studentName: (studentRow as { full_name: string } | null)?.full_name || "you",
    when: sessionWhen(start, parsed.data.durationMinutes),
    topic: parsed.data.topic ?? null,
    location: parsed.data.location ?? null,
  });

  revalidatePath("/tutor");
  revalidatePath("/dashboard");
  return { message: "Session scheduled. It now shows on both your and the student's timetable." };
}

/**
 * The attendance "tick". Both tutor and student confirm independently;
 * the admin sees each side's tick. Only allowed once the session is due
 * (start − 15 min grace), so neither party can pre-confirm a meeting that
 * hasn't happened.
 */
export async function confirmSessionAttendance(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const profile = await requireProfile();
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { error: "Missing session." };

  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("tutoring_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found." };

  const sessionRow = session as TutoringSession;
  if (sessionRow.status === "cancelled") {
    return { error: "This session was cancelled." };
  }
  const start = new Date(sessionRow.scheduled_at).getTime();
  if (start > Date.now() + CONFIRM_GRACE_MS) {
    return { error: "This session hasn't started yet — tick it when you meet." };
  }

  if (profile.role === "tutor") {
    const { data: tutorProfile } = await supabase
      .from("tutor_profiles")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (!tutorProfile || (tutorProfile as { id: string }).id !== sessionRow.tutor_profile_id) {
      return { error: "This isn't one of your sessions." };
    }
    if (sessionRow.tutor_confirmed_at) {
      return { message: "You already confirmed this session." };
    }
    const { error } = await supabase
      .from("tutoring_sessions")
      .update({
        tutor_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionRow.id);
    if (error) return { error: error.message };
  } else if (profile.role === "student") {
    if (sessionRow.student_id !== profile.id) {
      return { error: "This isn't one of your sessions." };
    }
    if (sessionRow.student_confirmed_at) {
      return { message: "You already confirmed this session." };
    }
    const { error } = await supabase
      .from("tutoring_sessions")
      .update({
        student_confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionRow.id);
    if (error) return { error: error.message };
  } else {
    return { error: "Only tutors and students can confirm attendance." };
  }

  // Admins are emailed on each tick — that's how they know the tutor is
  // actually doing the job (best-effort, after the response).
  const { data: names } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", [sessionRow.student_id, profile.id]);
  const nameMap = new Map((names ?? []).map((n) => [n.id as string, n.full_name as string]));
  const { data: tutorRow } = await supabase
    .from("tutor_profiles")
    .select("profiles(full_name)")
    .eq("id", sessionRow.tutor_profile_id)
    .maybeSingle();
  const tutorName =
    (tutorRow as { profiles?: { full_name: string } } | null)?.profiles?.full_name ||
    nameMap.get(profile.id) ||
    "The tutor";
  const studentName = nameMap.get(sessionRow.student_id) || "The student";

  notifyAttendanceTicked({
    tutorName,
    studentName,
    when: sessionWhen(new Date(sessionRow.scheduled_at), sessionRow.duration_minutes),
    topic: sessionRow.topic,
    confirmedBy: profile.full_name || (profile.role === "tutor" ? "The tutor" : "The student"),
    tutorTick: Boolean(sessionRow.tutor_confirmed_at) || profile.role === "tutor",
    studentTick: Boolean(sessionRow.student_confirmed_at) || profile.role === "student",
  });

  revalidatePath("/tutor");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { message: "Attendance confirmed." };
}

/** Tutors and students can cancel/decline their own upcoming sessions. */
export async function cancelSession(
  _prev: SessionFormState,
  formData: FormData,
): Promise<SessionFormState> {
  const profile = await requireProfile();
  if (profile.role !== "tutor" && profile.role !== "student") {
    return { error: "Only tutors and students can cancel sessions." };
  }

  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { error: "Missing session." };

  const supabase = createAdminClient();

  const { data: session } = await supabase
    .from("tutoring_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return { error: "Session not found." };

  const sessionRow = session as TutoringSession;
  if (sessionRow.status === "cancelled") {
    return { message: "This session was already cancelled." };
  }
  const start = new Date(sessionRow.scheduled_at).getTime();
  if (start <= Date.now() + CONFIRM_GRACE_MS) {
    return { error: "This session has already started — it can no longer be cancelled." };
  }

  // Ownership: tutors cancel via their tutor profile, students by their id.
  if (profile.role === "tutor") {
    const { data: tutorProfile } = await supabase
      .from("tutor_profiles")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (!tutorProfile || (tutorProfile as { id: string }).id !== sessionRow.tutor_profile_id) {
      return { error: "This isn't one of your sessions." };
    }
  } else if (sessionRow.student_id !== profile.id) {
    return { error: "This isn't one of your sessions." };
  }

  // Soft delete: keep the row so the admin's tracker shows who cancelled.
  const { error } = await supabase
    .from("tutoring_sessions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: profile.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionRow.id);
  if (error) return { error: error.message };

  // Email the other party so they know the session is off (best-effort).
  if (profile.role === "tutor") {
    notifySessionCancelled({
      recipientProfileIds: [sessionRow.student_id],
      cancelledByName: profile.full_name || "The tutor",
      when: sessionWhen(new Date(sessionRow.scheduled_at), sessionRow.duration_minutes),
      topic: sessionRow.topic,
    });
  } else {
    const { data: tp } = await supabase
      .from("tutor_profiles")
      .select("profile_id")
      .eq("id", sessionRow.tutor_profile_id)
      .maybeSingle();
    if (tp) {
      notifySessionCancelled({
        recipientProfileIds: [(tp as { profile_id: string }).profile_id],
        cancelledByName: profile.full_name || "The student",
        when: sessionWhen(new Date(sessionRow.scheduled_at), sessionRow.duration_minutes),
        topic: sessionRow.topic,
      });
    }
  }

  revalidatePath("/tutor");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  return { message: "Session cancelled." };
}
