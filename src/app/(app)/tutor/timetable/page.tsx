import { requireRole } from "@/services/auth/queries";
import { getOwnTutorProfile } from "@/services/tutors/queries";
import {
  listSessionsForTutor,
  listTutorStudents,
  type SessionView,
} from "@/services/sessions/queries";
import { SessionCard } from "@/components/sessions/SessionCard";
import { TimetableViews } from "@/components/sessions/TimetableViews";
import { ScheduleSessionModal } from "@/components/sessions/ScheduleSessionModal";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/** Sessions can be ticked from 15 minutes before their start time. */
const GRACE_MS = 15 * 60 * 1000;

/**
 * Split the timetable into upcoming vs past/in-progress and count pending
 * ticks. Module-level so the render stays pure (React Compiler lint).
 */
function splitTimetable(sessions: SessionView[]) {
  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduled_at).getTime() > now + GRACE_MS,
  );
  const past = sessions
    .filter((s) => !upcoming.includes(s))
    .reverse(); // most recent first
  // Only sessions that are due/ended and still unticked by me — upcoming
  // ones haven't started, so they aren't "awaiting" anything yet.
  const awaitingTick = sessions.filter(
    (s) =>
      !s.tutor_confirmed_at &&
      new Date(s.scheduled_at).getTime() <= now + GRACE_MS,
  ).length;
  return { now, upcoming, past, awaitingTick };
}

/** Timetable tab — sessions with the tutor, calendar views, scheduling. */
export default async function TutorTimetablePage() {
  await requireRole("tutor");

  const [tutor, sessions, students] = await Promise.all([
    getOwnTutorProfile(),
    listSessionsForTutor(),
    listTutorStudents(),
  ]);

  const isApproved = tutor.profile?.verification_status === "approved";
  const { now, upcoming, past, awaitingTick } = splitTimetable(sessions);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Sessions with your students
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Schedule meetings, then both you and the student tick attendance
            when you meet — the admin sees both ticks, so your work is
            verifiable.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge tone="amber">{upcoming.length} upcoming</Badge>
          {awaitingTick > 0 && (
            <Badge tone="neutral">{awaitingTick} awaiting your tick</Badge>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <TimetableViews
          sessions={sessions}
          now={now}
          counterpartLabel="student"
          listView={
            <div className="space-y-4">
              {upcoming.length === 0 && past.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-14 text-center">
                  <p className="text-sm text-slate-500">
                    No sessions yet. Once students contact you, schedule your
                    first meeting with &ldquo;Schedule a session&rdquo;.
                  </p>
                </div>
              ) : (
                <>
                  {upcoming.map((session) => (
                    <SessionCard
                      key={session.id}
                      session={session}
                      role="tutor"
                      now={now}
                    />
                  ))}

                  {past.length > 0 && (
                    <div className="pt-6">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Past &amp; in progress
                      </h3>
                      <div className="mt-3 space-y-4">
                        {past.map((session) => (
                          <SessionCard
                            key={session.id}
                            session={session}
                            role="tutor"
                            now={now}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          }
        />

        <div>
          <Card className="lg:sticky lg:top-24">
            <h3 className="text-lg font-semibold text-slate-900">
              Schedule a session
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Pick a student, a time, and a topic — it appears on both
              timetables immediately.
            </p>
            {isApproved ? (
              <>
                <div className="mt-4">
                  <ScheduleSessionModal students={ students } />
                </div>
                {students.length === 0 && (
                  <p className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center text-sm text-slate-500">
                    Students who contact you through Harcourt will appear here,
                    ready to be scheduled.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                Your timetable unlocks once your tutor profile is approved.
              </p>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
