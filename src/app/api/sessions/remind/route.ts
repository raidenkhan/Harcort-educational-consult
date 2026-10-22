import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sessionsNeedingReminder,
  sessionReminderDedupePrefix,
  sessionReminderText,
  smsTimeLabel,
  type ReminderSession,
} from "@/lib/smsReminders";
import { notifySmsToProfiles } from "@/lib/sms";

/**
 * GET /api/sessions/remind — texts both parties about a session that is about
 * to start.
 *
 * Driven by .github/workflows/reminders.yml (every 15 minutes) rather than a
 * Vercel cron: the free plan only allows daily crons, and a daily reminder
 * for a session at 4pm is useless. The workflow calls this route with
 * `Authorization: Bearer <CRON_SECRET>` — the same secret Vercel Cron uses.
 *
 * Safety:
 *   * every send CLAIMS a dedupe key first ("session:<id>:reminder:<profile>"),
 *     so running this twice — a retry, an overlapping run, a manual run — can
 *     never text anybody twice,
 *   * the window is wide (45–90 minutes) because GitHub's scheduler drifts,
 *   * nobody without a phone, and nobody who opted out, is texted.
 */

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();

  // Sessions starting inside the window. The status filter is applied in the
  // query too — a cancelled session is not a reminder candidate at all.
  const { data, error } = await supabase
    .from("tutoring_sessions")
    .select(
      "id, scheduled_at, duration_minutes, topic, status, student_id, student:profiles!student_id(full_name), tutor_profile:tutor_profiles(profile_id, profiles(full_name))",
    )
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date(now + 45 * 60_000).toISOString())
    .lte("scheduled_at", new Date(now + 90 * 60_000).toISOString());

  if (error) {
    console.error(`[sms] reminder query failed: ${error.message}`);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  const sessions: ReminderSession[] = (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      scheduled_at: string;
      duration_minutes: number;
      topic: string | null;
      status: string;
      student_id: string;
      student: { full_name?: string } | { full_name?: string }[] | null;
      tutor_profile:
        | { profile_id?: string; profiles?: { full_name?: string } | { full_name?: string }[] | null }
        | null;
    };
    const one = <T,>(v: T | T[] | null): T | null =>
      v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;
    const student = one(r.student);
    const tutorProfile = one(r.tutor_profile);
    const tutor = one(tutorProfile?.profiles ?? null);
    return {
      id: r.id,
      scheduled_at: r.scheduled_at,
      duration_minutes: r.duration_minutes,
      topic: r.topic,
      status: r.status,
      student_id: r.student_id,
      student_name: student?.full_name ?? "your student",
      tutor_profile_id: tutorProfile?.profile_id ?? "",
      tutor_name: tutor?.full_name ?? "your tutor",
    };
  });

  const due = sessionsNeedingReminder(sessions, now);

  for (const session of due) {
    const when = smsTimeLabel(new Date(session.scheduled_at).getTime());
    const dedupe = sessionReminderDedupePrefix(session.id);

    notifySmsToProfiles(
      [session.student_id],
      sessionReminderText({
        role: "student",
        when,
        counterpart: session.tutor_name,
        topic: session.topic,
      }),
      "session_reminder",
      dedupe,
    );

    if (session.tutor_profile_id) {
      notifySmsToProfiles(
        [session.tutor_profile_id],
        sessionReminderText({
          role: "tutor",
          when,
          counterpart: session.student_name,
          topic: session.topic,
        }),
        "session_reminder",
        dedupe,
      );
    }
  }

  return NextResponse.json({
    ok: true,
    window: "45-90m",
    candidates: sessions.length,
    due: due.length,
  });
}
