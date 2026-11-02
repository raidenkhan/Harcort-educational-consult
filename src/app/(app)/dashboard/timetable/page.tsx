import { redirect } from "next/navigation";
import { requireProfile } from "@/services/auth/queries";
import {
  listSessionsForStudent,
  type SessionView,
} from "@/services/sessions/queries";
import { Badge } from "@/components/ui/Badge";
import { SessionCard } from "@/components/sessions/SessionCard";
import { TimetableViews } from "@/components/sessions/TimetableViews";

/** Sessions can be ticked from 15 minutes before their start time. */
const GRACE_MS = 15 * 60 * 1000;

/** Module-level split so the render stays pure (React Compiler lint). */
function splitStudentTimetable(sessions: SessionView[]) {
  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduled_at).getTime() > now + GRACE_MS,
  );
  const other = sessions.filter((s) => !upcoming.includes(s));
  return { now, upcoming, other };
}

/**
 * Student dashboard — Timetable. When the student meets their tutors, in
 * list or calendar form, with the dual attendance tick on each session.
 */
export default async function StudentTimetablePage() {
  const profile = await requireProfile();
  if (profile.role !== "student") redirect("/dashboard");

  const sessions = await listSessionsForStudent();
  const { now, upcoming, other } = splitStudentTimetable(sessions);

  return (
    <section className="mt-10">
      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
          <p className="text-sm text-slate-500">
            No sessions yet. Find a tutor, start a conversation, and your
            tutor will schedule sessions here.
          </p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="mb-4">
              <Badge tone="petrol">{upcoming.length} upcoming</Badge>
            </div>
          )}
          <TimetableViews
            sessions={sessions}
            now={now}
            counterpartLabel="tutor"
            listView={
              <div className="mt-6 space-y-4">
                {upcoming.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    role="student"
                    now={now}
                  />
                ))}
                {other.length > 0 && (
                  <div className="pt-6">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                      Past &amp; in progress
                    </h3>
                    <div className="mt-3 space-y-4">
                      {other.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          role="student"
                          now={now}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            }
          />
        </>
      )}
    </section>
  );
}
